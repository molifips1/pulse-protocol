"""
PULSE PROTOCOL — Stream Detection Service
Ingests HLS streams, samples frames, detects high-signal events.
Fires webhooks to the Oracle signing service.

v1: Stubbed with configurable event templates per game category.
v2: Replace detect_event() with real vision model (GPT-4o / Florence-2).
"""

import asyncio
import hashlib
import json
import os
import random
import time
from dataclasses import dataclass, field
from typing import Optional
import aiohttp
import subprocess

# ============ Config ============
ORACLE_URL = os.getenv("ORACLE_URL", "http://localhost:3001")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "dev-secret")
FRAME_SAMPLE_INTERVAL = float(os.getenv("FRAME_SAMPLE_INTERVAL", "2.0"))  # seconds

# ============ Event Templates per Category ============
EVENT_TEMPLATES = {
    "fps": [
        {"type": "clutch", "title_template": "Will {streamer} clutch this 1v{n}?", "params": {"n": [2, 3, 4]}},
        {"type": "kill", "title_template": "Will {streamer} get the next kill within 30s?", "params": {}},
        {"type": "win", "title_template": "Will {streamer}'s team win this round?", "params": {}},
        {"type": "death", "title_template": "Will {streamer} die in the next 60s?", "params": {}},
    ],
    "sports": [
        {"type": "goal", "title_template": "Will {streamer} score in the next 2 minutes?", "params": {}},
        {"type": "win", "title_template": "Will {streamer} win this match?", "params": {}},
        {"type": "penalty", "title_template": "Will the next penalty be scored?", "params": {}},
    ],
    "irl": [
        {"type": "debate_outcome", "title_template": "Will {streamer} win this argument?", "params": {}},
        {"type": "reaction", "title_template": "Will {streamer} rage quit in 5 minutes?", "params": {}},
        {"type": "donation_goal", "title_template": "Will {streamer} hit the $500 donation goal?", "params": {}},
    ],
    "other": [
        {"type": "win", "title_template": "Will {streamer} succeed at this attempt?", "params": {}},
    ]
}

@dataclass
class StreamConfig:
    stream_id: str
    streamer_id: Optional[str]
    streamer_name: str
    streamer_wallet: str
    platform: str  # twitch | kick
    channel: str
    game_category: str  # fps | irl | sports | other
    hls_url: Optional[str] = None
    is_stub: bool = True  # v1: always stub, v2: real inference

@dataclass
class DetectedEvent:
    stream_id: str
    event_type: str
    title: str
    confidence: float
    frame_hash: str
    category: str
    raw: dict = field(default_factory=dict)

# ============ Stub Detector ============

def stub_detect_event(config: StreamConfig) -> Optional[DetectedEvent]:
    """
    v1 stub: randomly fires events based on probability.
    Replace this with real vision model inference in v2.
    
    Real v2 implementation:
    1. Pull HLS segment via ffmpeg
    2. Extract frame as JPEG
    3. Send to GPT-4o vision / Florence-2
    4. Parse structured response
    5. Apply confidence threshold
    """
    # Simulate ~10% chance of detecting an event per sample
    if random.random() > 0.10:
        return None

    templates = EVENT_TEMPLATES.get(config.game_category, EVENT_TEMPLATES["other"])
    template = random.choice(templates)

    # Build title
    params = {k: random.choice(v) for k, v in template["params"].items()} if template["params"] else {}
    title = template["title_template"].format(streamer=config.streamer_name, **params)

    # Fake frame hash
    frame_data = f"{config.stream_id}:{time.time()}:{random.random()}"
    frame_hash = hashlib.sha256(frame_data.encode()).hexdigest()

    return DetectedEvent(
        stream_id=config.stream_id,
        event_type=template["type"],
        title=title,
        confidence=round(random.uniform(0.82, 0.98), 3),
        frame_hash=frame_hash,
        category=config.game_category,
        raw={"source": "stub_v1", "template": template["type"], "ts": time.time()}
    )

async def real_detect_event(config: StreamConfig, frame_jpeg_bytes: bytes) -> Optional[DetectedEvent]:
    """
    v2 placeholder: send frame to vision model.
    Implement with OpenAI or local Florence-2.
    """
    raise NotImplementedError("Real detection not implemented — use stub for v1")

# ============ HLS Frame Extractor (v2 prep) ============

def extract_frame(hls_url: str) -> Optional[bytes]:
    """Extract single JPEG frame from HLS stream via ffmpeg."""
    try:
        result = subprocess.run([
            "ffmpeg", "-i", hls_url,
            "-vframes", "1",
            "-f", "image2",
            "-vcodec", "mjpeg",
            "-loglevel", "error",
            "pipe:1"
        ], capture_output=True, timeout=5)
        if result.returncode == 0:
            return result.stdout
    except Exception as e:
        print(f"[DETECTOR] Frame extraction failed: {e}")
    return None

# ============ Oracle Webhook Caller ============

async def fire_market_creation(session: aiohttp.ClientSession, event: DetectedEvent, config: StreamConfig):
    payload = {
        "streamId": event.stream_id,
        "streamerId": config.streamer_id,
        "streamerWallet": config.streamer_wallet,
        "eventType": event.event_type,
        "confidence": event.confidence,
        "marketTitle": event.title,
        "bettingWindowSeconds": 60,
        "frameHash": event.frame_hash,
        "rawDetection": event.raw,
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
                print(f"[DETECTOR] Market created: {data.get('marketId')} — {event.title}")
            else:
                print(f"[DETECTOR] Oracle error: {data}")
    except Exception as e:
        print(f"[DETECTOR] Webhook failed: {e}")

# ============ Stream Monitor Loop ============

async def monitor_stream(config: StreamConfig, session: aiohttp.ClientSession):
    """Monitor a single stream continuously."""
    print(f"[DETECTOR] Monitoring: {config.channel} ({config.game_category}) [stub={config.is_stub}]")
    
    # Track last market time to avoid spam (min 90s between markets per stream)
    last_market_ts = 0.0

    while True:
        now = time.time()
        cooldown_ok = (now - last_market_ts) > 90

        event = None
        if config.is_stub:
            event = stub_detect_event(config)
        else:
            if config.hls_url:
                frame = extract_frame(config.hls_url)
                if frame:
                    event = await real_detect_event(config, frame)

        if event and cooldown_ok:
            last_market_ts = now
            await fire_market_creation(session, event, config)

        await asyncio.sleep(FRAME_SAMPLE_INTERVAL)

async def main():
    # Load stream configs from env or config file
    streams_json = os.getenv("STREAMS_CONFIG", "[]")
    streams_raw = json.loads(streams_json)

    if not streams_raw:
        # Default dev streams for testing
        streams_raw = [
            {
                "stream_id": "stream-valorant-001",
                "streamer_id": None,
                "streamer_name": "ProPlayer",
                "streamer_wallet": "0x0000000000000000000000000000000000000000",
                "platform": "twitch",
                "channel": "proplayer",
                "game_category": "fps",
                "is_stub": True
            },
            {
                "stream_id": "stream-irl-001",
                "streamer_id": None,
                "streamer_name": "TalkStreamer",
                "streamer_wallet": "0x0000000000000000000000000000000000000000",
                "platform": "kick",
                "channel": "talkstreamer",
                "game_category": "irl",
                "is_stub": True
            }
        ]

    streams = [StreamConfig(**s) for s in streams_raw]

    async with aiohttp.ClientSession() as session:
        tasks = [monitor_stream(s, session) for s in streams]
        await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())
