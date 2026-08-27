// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";

/// @notice Deploys InvoiceFactory to the active BOT Chain network.
/// @dev Usage:
///   PRIVATE_KEY=0x... FEE_RECIPIENT=0x... forge script script/Deploy.s.sol:DeployScript --rpc-url https://rpc.bohr.life --broadcast
contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        // USDT address for the active network. Testnet (968) default.
        address usdt = vm.envOr("USDT_ADDRESS", address(0x75edC9335175Fc0552D51D48439F229c10420fe3));

        vm.startBroadcast(deployerPrivateKey);
        InvoiceFactory factory = new InvoiceFactory(usdt, feeRecipient);
        vm.stopBroadcast();

        console.log("InvoiceFactory deployed at:", address(factory));
        console.log("USDT token:", usdt);
        console.log("Fee recipient:", feeRecipient);
    }
}