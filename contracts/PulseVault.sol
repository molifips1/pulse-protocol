// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract PulseVault {
    uint256 public constant RAKE_BPS = 75;
    uint256 public constant STREAMER_SHARE = 2500;
    uint256 public constant BPS = 10000;

    IERC20 public immutable usdc;
    address public oracleSigner;
    address public owner;
    address public treasury;

    struct Market {
        bytes32 id;
        address streamer;
        uint256[4] totals;
        uint256 closesAt;
        uint8 status;
        uint8 outcome;
    }

    struct Bet {
        address bettor;
        bytes32 marketId;
        uint8 bucket;
        uint256 amount;
        bool claimed;
    }

    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => Bet) public bets;
    mapping(bytes32 => bytes32[]) public marketBets;

    event MarketCreated(bytes32 indexed marketId);
    event BetPlaced(bytes32 indexed betId, bytes32 indexed marketId, address bettor, uint8 bucket, uint256 amount);
    event MarketResolved(bytes32 indexed marketId, uint8 outcome);
    event WinningsClaimed(bytes32 indexed betId, address bettor, uint256 payout);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdc, address _oracleSigner, address _treasury) {
        usdc = IERC20(_usdc);
        oracleSigner = _oracleSigner;
        treasury = _treasury;
        owner = msg.sender;
    }

    function createMarket(bytes32 marketId, address streamer, uint256 bettingWindowSeconds) external {
        require(msg.sender == oracleSigner || msg.sender == owner, "Auth");
        require(markets[marketId].closesAt == 0, "Exists");
        Market storage m = markets[marketId];
        m.id = marketId;
        m.streamer = streamer;
        m.totals[0] = 0;
        m.totals[1] = 0;
        m.totals[2] = 0;
        m.totals[3] = 0;
        m.closesAt = block.timestamp + bettingWindowSeconds;
        m.status = 1;
        m.outcome = 0;
        emit MarketCreated(marketId);
    }

    function placeBet(bytes32 marketId, uint8 bucket, uint256 amount) external returns (bytes32 betId) {
        require(bucket <= 3, "Bad bucket");
        Market storage m = markets[marketId];
        require(m.status == 1, "Not open");
        require(block.timestamp < m.closesAt, "Closed");
        require(amount > 0, "Zero");
        usdc.transferFrom(msg.sender, address(this), amount);
        betId = keccak256(abi.encodePacked(marketId, msg.sender, block.timestamp, amount));
        bets[betId] = Bet(msg.sender, marketId, bucket, amount, false);
        marketBets[marketId].push(betId);
        m.totals[bucket] += amount;
        emit BetPlaced(betId, marketId, msg.sender, bucket, amount);
    }

    function resolveMarket(bytes32 marketId, uint8 outcome) external {
        require(msg.sender == oracleSigner || msg.sender == owner, "Auth");
        Market storage m = markets[marketId];
        require(m.status == 1, "Not open");
        require(outcome <= 3, "Bad outcome");
        m.status = 2;
        m.outcome = outcome;
        uint256 totalPool = m.totals[0] + m.totals[1] + m.totals[2] + m.totals[3];
        uint256 rake = (totalPool * RAKE_BPS) / BPS;
        uint256 streamerCut = (rake * STREAMER_SHARE) / BPS;
        uint256 protocolCut = rake - streamerCut;
        if (streamerCut > 0 && m.streamer != address(0)) {
            usdc.transfer(m.streamer, streamerCut);
        }
        if (protocolCut > 0) {
            usdc.transfer(treasury, protocolCut);
        }
        emit MarketResolved(marketId, outcome);
    }

    function claimWinnings(bytes32 betId) external {
        Bet storage b = bets[betId];
        require(b.bettor == msg.sender, "Not bettor");
        require(!b.claimed, "Claimed");
        Market storage m = markets[b.marketId];
        require(m.status == 2, "Not resolved");
        require(m.outcome == b.bucket, "Lost");
        b.claimed = true;
        uint256 totalPool = m.totals[0] + m.totals[1] + m.totals[2] + m.totals[3];
        uint256 rake = (totalPool * RAKE_BPS) / BPS;
        uint256 netPool = totalPool - rake;
        uint256 winningSide = m.totals[m.outcome];
        uint256 payout = (b.amount * netPool) / winningSide;
        usdc.transfer(msg.sender, payout);
        emit WinningsClaimed(betId, msg.sender, payout);
    }

    function voidMarket(bytes32 marketId) external {
        require(msg.sender == oracleSigner || msg.sender == owner, "Auth");
        markets[marketId].status = 3;
    }

    function claimRefund(bytes32 betId) external {
        Bet storage b = bets[betId];
        require(b.bettor == msg.sender, "Not bettor");
        require(!b.claimed, "Claimed");
        require(markets[b.marketId].status == 3, "Not voided");
        b.claimed = true;
        usdc.transfer(msg.sender, b.amount);
    }

    function setOracleSigner(address _signer) external onlyOwner {
        oracleSigner = _signer;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }
}
