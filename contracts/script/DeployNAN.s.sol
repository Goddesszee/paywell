// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {NANNameRegistry} from "../NANNameRegistry.sol";
import {PaywellEscrow} from "../PaywellEscrow.sol";

contract DeployNAN is Script {
    // Arc Mainnet USDC ERC-20 address
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        address feeRecipient = vm.envOr("FEE_RECIPIENT", msg.sender);
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(100)); // 1%

        vm.startBroadcast();

        NANNameRegistry registry = new NANNameRegistry(USDC);
        console.log("NANNameRegistry deployed to:", address(registry));

        PaywellEscrow escrow = new PaywellEscrow(USDC, feeRecipient, feeBps);
        console.log("PaywellEscrow deployed to:  ", address(escrow));

        vm.stopBroadcast();
    }
}
