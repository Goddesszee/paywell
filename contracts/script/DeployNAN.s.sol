// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {NANNameRegistry} from "../NANNameRegistry.sol";

contract DeployNAN is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        vm.startBroadcast();
        NANNameRegistry registry = new NANNameRegistry(USDC);
        console.log("NANNameRegistry deployed to:", address(registry));
        vm.stopBroadcast();
    }
}
