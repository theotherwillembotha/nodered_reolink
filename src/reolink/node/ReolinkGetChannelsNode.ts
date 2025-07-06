import { Node } from "node-red";
import { BaseNode, BaseNodeConfig, NodeDescription, JsonUtil, NodeManager, SourceUtility, onInput } from "@theotherwillembotha/node-red-plugincore";
import { Metrics, MetricType, MetricsTemplate, CounterMetric, MetricsTemplateConfig } from "@theotherwillembotha/node-red-plugincore";
import { Log, Logger, LoggerTemplate, LoggerTemplateConfig } from "@theotherwillembotha/node-red-plugincore";

import { ReolinkConfigNode } from "./ReolinkConfigNode";

interface ReolinkGetChannelsNodeConfig extends BaseNodeConfig, MetricsTemplateConfig, LoggerTemplateConfig {
    reolinkconfig: string;
    outputpath: string;
}

@NodeDescription({
    id:"ReolinkGetChannelsNode",
    name:"Reolink Get Channels Node",
    group:"reolink",
    sourceFile:SourceUtility.getSourcePath("/build/", "/src/") + "ReolinkGetChannelsNode.html",
    package: "@theotherwillembotha/node-red-reolink",
    templates: [
        { template: LoggerTemplate, config: {}},
        { template: MetricsTemplate, config: {}}
    ],
    dependencies: [ ReolinkConfigNode ],
    tags: [ "Reolink" ]
})
export class ReolinkGetChannelsNode extends BaseNode<ReolinkGetChannelsNodeConfig> {

    @Logger()
    private log!:Log;
    
    @Metrics({name:"request",type:MetricType.Counter, description:"number of requests made"})
    private counter!:CounterMetric;
    
    private _reolinkConfigNode: ReolinkConfigNode;

    constructor(node: Node, config: ReolinkGetChannelsNodeConfig){
        super(node, config);

        // get a reference to the reolink clients.
        this._reolinkConfigNode = (NodeManager.RED.nodes.getNode(config.reolinkconfig) as any).node();
    }

    @onInput()
    protected async onInput(message:Object, errorHandler:Function){
        // when receiving a message, do a fetch of the current channels.
        let channelList = await this._reolinkConfigNode.serviceInstance().getChannels();
        let outputpath = (this.config().outputpath) ? this.config().outputpath : "payload";
        let data = JsonUtil.jsonUpdate(message, outputpath, channelList);
        this.log.log(channelList);
        this.counter.inc();
        this.node().send([data]);
    }
}
