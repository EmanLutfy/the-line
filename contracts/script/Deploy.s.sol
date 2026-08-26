// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TheLine} from "../src/TheLine.sol";
import {LineMint} from "../src/LineMint.sol";

/// Deploys the pair and wires them together. $LINE is NOT configured here —
/// the token does not exist yet, so `configure` is a separate step once its
/// address is known, and `lockConfig` a separate one after that.
///
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url robinhood_testnet --broadcast -vvvv
contract Deploy is Script {
    function run() external {
        address owner = vm.envAddress("OWNER_ADDRESS");
        string memory unrevealedURI = vm.envString("UNREVEALED_URI");
        string memory contractURI = vm.envString("CONTRACT_URI");
        bytes32 provenance = vm.envBytes32("PROVENANCE_HASH");

        vm.startBroadcast();

        TheLine nft = new TheLine(owner, unrevealedURI, contractURI, provenance);
        LineMint sale = new LineMint(owner, address(nft));

        // Only meaningful when the broadcaster is the owner. If ownership sits
        // in a multisig, drop these two lines and run them from there instead.
        nft.setMinter(address(sale));

        vm.stopBroadcast();

        console2.log("TheLine  :", address(nft));
        console2.log("LineMint :", address(sale));
        console2.log("");
        console2.log("Still to do, in order:");
        console2.log("  1. nft.lockMinter()");
        console2.log("  2. sale.configure(LINE, 150000e18, useBurnFrom)");
        console2.log("  3. sale.lockConfig()");
        console2.log("  4. sale.setSaleOpen(true)");
        console2.log("  5. nft.setDefaultRoyalty(<new wallet>, 500)  once the wallet exists");
    }
}
