// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// SquadXI role-bonus claim vault, Robinhood Chain testnet.
///
/// Off-chain (squadxi-site's finalizeMatchContests) decides who won each of
/// a contest's role bonuses and for how much -- this contract only verifies
/// an operator-signed voucher and pays out once per claimId. Permissionless:
/// anyone may submit a valid voucher, but funds always go to the `winner`
/// address baked into the signed message, never to msg.sender.
contract RoleBonusClaim is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public immutable operator;

    mapping(bytes32 => bool) public claimed;

    event BonusClaimed(bytes32 indexed claimId, address indexed winner, uint256 amountWei);

    error AlreadyClaimed(bytes32 claimId);
    error InvalidSignature();
    error InsufficientBalance(uint256 requested, uint256 available);
    error TransferFailed();

    constructor(address _operator, address _owner) Ownable(_owner) {
        require(_operator != address(0), "operator is zero address");
        operator = _operator;
    }

    receive() external payable {}

    /// @param claimId keccak256(contestId, role) -- computed identically off-chain in squadxi-site
    /// @param winner recipient, fixed by the signed voucher regardless of who submits the tx
    /// @param amountWei payout amount, fixed by the signed voucher
    /// @param signature operator's signature over (claimId, winner, amountWei, address(this), block.chainid)
    function claim(
        bytes32 claimId,
        address winner,
        uint256 amountWei,
        bytes calldata signature
    ) external nonReentrant {
        if (claimed[claimId]) revert AlreadyClaimed(claimId);

        bytes32 messageHash = keccak256(
            abi.encodePacked(claimId, winner, amountWei, address(this), block.chainid)
        );
        address signer = messageHash.toEthSignedMessageHash().recover(signature);
        if (signer != operator) revert InvalidSignature();

        if (amountWei > address(this).balance) {
            revert InsufficientBalance(amountWei, address(this).balance);
        }

        claimed[claimId] = true;
        emit BonusClaimed(claimId, winner, amountWei);

        (bool success, ) = winner.call{value: amountWei}("");
        if (!success) revert TransferFailed();
    }

    /// Testnet-only escape hatch -- sweeps unclaimed testnet ETH back to the owner.
    function withdrawUnclaimed(address to, uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientBalance(amount, address(this).balance);
        }
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
    }
}
