import { NodeGenerator } from "@theotherwillembotha/node-red-plugincore";
// services.
import { ReolinkService } from "./reolink/service/ReolinkService";

// nodes.
import { ReolinkConfigNode } from "./reolink/node/ReolinkConfigNode";
import { ReolinkEventNode } from "./reolink/node/ReolinkEventNode";
import { ReolinkSpotlightNode } from "./reolink/node/ReolinkSpotlightNode";
import { ReolinkSnapshotNode } from "./reolink/node/ReolinkSnapShotNode";
import { ReolinkSirenNode } from "./reolink/node/ReolinkSirenNode";
import { ReolinkGetChannelsNode } from "./reolink/node/ReolinkGetChannelsNode";

new NodeGenerator("./src/")
    // services.
    .registerService(ReolinkService)

    // nodes
    .registerNode(ReolinkConfigNode)
    .registerNode(ReolinkEventNode)
    .registerNode(ReolinkSpotlightNode)
    .registerNode(ReolinkSnapshotNode)
    .registerNode(ReolinkSirenNode)
    .registerNode(ReolinkGetChannelsNode)

    // done.
    .generate("./build/Nodes", "./build/Plugins");

process.exit(0);