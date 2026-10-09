import { NodeGenerator, NodeTypeService } from "@theotherwillembotha/node-red-plugincore";

import { ReolinkConfigNode } from "./reolink/node/ReolinkConfigNode";
import { ReolinkEventNode } from "./reolink/node/ReolinkEventNode";
import { ReolinkSpotlightNode } from "./reolink/node/ReolinkSpotlightNode";
import { ReolinkSnapshotNode } from "./reolink/node/ReolinkSnapShotNode";
import { ReolinkSirenNode } from "./reolink/node/ReolinkSirenNode";
import { ReolinkGetChannelsNode } from "./reolink/node/ReolinkGetChannelsNode";

// Only register leaf nodes and NodeTypeService.
// All infrastructure (services, templates, DelegatedConfigReferenceNode)
// is resolved automatically from @NodeDescription and @TemplateDescription
// dependency chains.
new NodeGenerator("./src/reolink/")
    .registerService(NodeTypeService)
    .registerNode(ReolinkConfigNode)
    .registerNode(ReolinkEventNode)
    .registerNode(ReolinkSpotlightNode)
    .registerNode(ReolinkSnapshotNode)
    .registerNode(ReolinkSirenNode)
    .registerNode(ReolinkGetChannelsNode)
    .generate("./build/Nodes", "./build/Plugins", "@theotherwillembotha/node-red-reolink");

process.exit(0);