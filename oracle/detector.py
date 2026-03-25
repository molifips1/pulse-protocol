"""
PULSE PROTOCOL — Stream Detector mit Groq Vision
Analysiert Kick Streams und erstellt automatisch Märkte
"""

import asyncio
import hashlib
import json
import os
import time
import base64
import subprocess
import aiohttp
from dataclasses import dataclass
from typing import Optional

# ============ Config ============
ORACLE_URL = os.getenv("ORACLE_URL", "http://localhost:3001")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "dev-secret")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
FRAME_INTERVAL = float(os.getenv("FRAME_INTERVAL", "30"))  # seconds between checks

# ============ Streams to monitor ============
STREAMS = json.loads(os.getenv("STREAMS_CONFIG", """[
  {
    "stream_id": "11111111-1111-1111-1111-111111111111",
    "streamer_id": null,
    "streamer_name": "xQc",
    "streamer_wallet": "0x0000000000000000000000000000000000000000",
    "platform": "kick",
    "channel": "xqc",
    "game_category": "irl"
  },
  {
    "stream_id": "22222222-2222-2222-2222-222222222222",
    "streamer_id": null,
    "streamer_name": "Trainwreckstv",
    "streamer_wallet": "0x0000000000000000000000000000000000000000",
    "platform": "kick",
    "channel": "trainwreckstv",
    "game_category": "irl"
  },
  {
    "stream_id": "44444444-4444-4444-4444-444444444444",
    "streamer_id": null,
    "streamer_name": "Buddha",
    "streamer_wallet": "0x0000000000000000000000000000000000000000",
    "platform": "kick",
    "channel": "buddha",
    "game_category": "fps"
  }
]"""))

@dataclass
class DetectedEvent:
    stream_id: str
    event_type: str
    title: str
    confidence: float
    frame_hash: str
    category: str

def capture_kick_frame(channel: str) -> Optional[str]:
    """
    Capture a frame from Kick stream via ffmpeg HLS.
    Returns base64 encoded JPEG or None if failed.
    """
    hls_url = f"https://kick.com/{channel}/video_stream"
    
    try:
        result = subprocess.run([
            "ffmpeg",
            "-i", f"https://kickcdn-stb.b-cdn.net/hls/{channel}/index.m3u8",
            "-vframes", "1",
            "-f", "image2",
            "-vcodec", "mjpeg",
            "-loglevel", "error",
            "-t", "5",
            "pipe:1"
        ], capture_output=True, timeout=15)
        
        if result.returncode == 0 and result.stdout:
            return base64.b64encode(result.stdout).decode('utf-8')
    except Exception as e:
        print(f"[DETECTOR] ffmpeg failed for {channel}: {e}")
    
    return None

async def analyze_frame_with_groq(
    frame_b64: str,
    channel: str,
    category: str,
    session: aiohttp.ClientSession
) -> Optional[dict]:
    """
    Send frame to Groq Vision API for analysis.
    Returns detected event or None.
    """
    
    category_prompts = {
        "fps": """Analyze this FPS gaming stream screenshot. Look for:
- Clutch situations (1v2, 1v3, 1v4, 1v5)
- Round win/loss screens
- Kill feed spikes
- Low health situations
- Victory/Defeat screens

Respond ONLY with JSON:
{
  "event_detected": true/false,
  "event_type": "clutch|win|loss|kill|death|none",
  "market_title": "Will [streamer] [action]?",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}""",
        "irl": """Analyze this IRL/Just Chatting stream screenshot. Look for:
- Heated debates or arguments
- Emotional reactions (rage, crying, laughing)
- Donation goals visible on screen
- Predictions or challenges mentioned
- Controversial moments

Respond ONLY with JSON:
{
  "event_detected": true/false,
  "event_type": "debate_outcome|reaction|donation_goal|challenge|none",
  "market_title": "Will [streamer] [action]?",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}""",
        "sports": """Analyze this sports gaming stream screenshot. Look for:
- Near-goal situations
- Penalty kicks
- Score changes
- Match win/loss screens
- Critical moments

Respond ONLY with JSON:
{
  "event_detected": true/false,
  "event_type": "goal|win|loss|penalty|none",
  "market_title": "Will [streamer] [action]?",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}"""
    }
    
    prompt = category_prompts.get(category, category_prompts["irl"])
    prompt = prompt.replace("[streamer]", channel)
    
    try:
        async with session.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama-3.2-11b-vision-preview",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{frame_b64}"
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ],
                "max_tokens": 200,
                "temperature": 0.1
            },
            timeout=aiohttp.ClientTimeout(total=20)
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                content = data["choices"][0]["message"]["content"]
                
                # Parse JSON from response
                import re
                json_match = re.search(r'\{.*\}', content, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group())
                    return result
            else:
                error = await resp.text()
                print(f"[GROQ] API error {resp.status}: {error[:200]}")
    except Exception as e:
        print(f"[GROQ] Request failed: {e}")
    
    return None

async def fire_market_creation(
    session: aiohttp.ClientSession,
    event: DetectedEvent,
    stream: dict
):
    """Send webhook to Oracle to create market."""
    payload = {
        "streamId": event.stream_id,
        "streamerId": stream.get("streamer_id"),
        "streamerWallet": stream.get("streamer_wallet", "0x0000000000000000000000000000000000000000"),
        "eventType": event.event_type,
        "confidence": event.confidence,
        "marketTitle": event.title,
        "bettingWindowSeconds": 60,
        "frameHash": event.frame_hash,
        "rawDetection": {"source": "groq_vision", "channel": stream["channel"]},
        "category": event.category
    }
    
    try:
        async with session.post(
            f"{ORACLE_URL}/webhook/event-detected",
            json=payload,
            headers={"x-pulse-secret": WEBHOOK_SECRET},
            timeout=aiohttp.ClientTimeout(total=10)
        ) as resp:
            data = await resp.json()
            if resp.status == 200:
                print(f"[DETECTOR] ✅ Market created: {event.title}")
            else:
                print(f"[DETECTOR] ❌ Oracle error: {data}")
    except Exception as e:
        print(f"[DETECTOR] Webhook failed: {e}")

async def monitor_stream(stream: dict, session: aiohttp.ClientSession):
    """Monitor a single stream continuously."""
    channel = stream["channel"]
    category = stream["game_category"]
    last_market_ts = 0.0
    
    print(f"[DETECTOR] 👀 Monitoring: {channel} ({category})")
    
    while True:
        now = time.time()
        cooldown_ok = (now - last_market_ts) > 90  # min 90s between markets
        
        if cooldown_ok:
            print(f"[DETECTOR] 📸 Capturing frame from {channel}...")
            
            frame_b64 = capture_kick_frame(channel)
            
            if frame_b64:
                print(f"[DETECTOR] 🧠 Analyzing with Groq Vision...")
                result = await analyze_frame_with_groq(frame_b64, channel, category, session)
                
                if result and result.get("event_detected") and result.get("confidence", 0) > 0.75:
                    frame_hash = hashlib.sha256(frame_b64[:100].encode()).hexdigest()
                    
                    event = DetectedEvent(
                        stream_id=stream["stream_id"],
                        event_type=result.get("event_type", "other"),
                        title=result.get("market_title", f"Will {channel} do it?"),
                        confidence=result.get("confidence", 0.8),
                        frame_hash=frame_hash,
                        category=category
                    )
                    
                    print(f"[DETECTOR] 🎯 Event detected: {event.title} ({event.confidence:.0%})")
                    await fire_market_creation(session, event, stream)
                    last_market_ts = now
                else:
                    reason = result.get("reasoning", "no event") if result else "frame capture failed"
                    print(f"[DETECTOR] 💤 No event on {channel}: {reason}")
            else:
                print(f"[DETECTOR] ⚠️  Could not capture frame from {channel}")
        
        await asyncio.sleep(FRAME_INTERVAL)

async def main():
    print(f"[DETECTOR] 🚀 Pulse Detector starting...")
    print(f"[DETECTOR] Monitoring {len(STREAMS)} streams")
    print(f"[DETECTOR] Frame interval: {FRAME_INTERVAL}s")
    
    if not GROQ_API_KEY:
        print("[DETECTOR] ❌ GROQ_API_KEY not set!")
        return
    
    async with aiohttp.ClientSession() as session:
        tasks = [monitor_stream(s, session) for s in STREAMS]
        await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())