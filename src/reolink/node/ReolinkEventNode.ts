import { Node } from "node-red";
import { BaseNode, BaseNodeConfig, NodeDescription, NodeManager, SourceUtility } from "@theotherwillembotha/node-red-plugincore";
import { Metrics, MetricType, MetricsTemplate, CounterMetric, MetricsTemplateConfig } from "@theotherwillembotha/node-red-plugincore";
import { Log, Logger, LoggerTemplate, LoggerTemplateConfig } from "@theotherwillembotha/node-red-plugincore";

import { ReolinkConfigNode } from "./ReolinkConfigNode";

interface ReolinkEventNodeConfig extends BaseNodeConfig, MetricsTemplateConfig, LoggerTemplateConfig {
    reolinkconfig: string;
    selectedDevices:string[];
}

@NodeDescription({
    id:"ReolinkEventNode",
    name:"Reolink Event Node",
    group:"reolink",
    sourceFile:SourceUtility.getSourcePath("/build/", "/src/") + "ReolinkEventNode.html",
    package: "@theotherwillembotha/node-red-reolink",
    templates: [
        { template: LoggerTemplate, config: {}},
        { template: MetricsTemplate, config: {}}
    ],
    dependencies: [ ReolinkConfigNode ],
    tags: [ "Reolink" ]
})
export class ReolinkEventNode extends BaseNode<ReolinkEventNodeConfig> {

    @Logger()
    private log!:Log;
    
    @Metrics({name:"request",type:MetricType.Counter, description:"number of requests made"})
    private counter!:CounterMetric;

    private _reolinkConfigNode: ReolinkConfigNode;

    constructor(node: Node, config: ReolinkEventNodeConfig){
        super(node, config);

        // get a reference to the reolink clients.
        this._reolinkConfigNode = (NodeManager.RED.nodes.getNode(config.reolinkconfig) as any).node();

        let eventListener = this._reolinkConfigNode.registerEventListener(config.selectedDevices, event => {
            this.log.log(event);
            this.counter.inc();
            this.node().send(event);
        });

        // the webserver has been initalized.
        this.node().on("close", () => {
            this._reolinkConfigNode.deregisterEventListener(eventListener);
        });
    }
}
