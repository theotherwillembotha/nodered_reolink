import { Node } from "node-red";
import { BaseNode, BaseNodeConfig, NodeDescription, NodeManager, onInput, SourceUtility } from "@theotherwillembotha/node-red-plugincore";
import { Metrics, MetricType, MetricsTemplate, CounterMetric, MetricsTemplateConfig } from "@theotherwillembotha/node-red-plugincore";
import { Log, Logger, LoggerTemplate, LoggerTemplateConfig } from "@theotherwillembotha/node-red-plugincore";

import { ReolinkConfigNode } from "./ReolinkConfigNode";

interface ReolinkSpotlightNodeConfig extends BaseNodeConfig, MetricsTemplateConfig, LoggerTemplateConfig {
    reolinkconfig: string;
    selectedDevices: string[];
}

@NodeDescription({
    id:"ReolinkSpotlightNode",
    name:"Reolink Spotlight Node",
    group:"reolink",
    sourceFile:SourceUtility.getSourcePath("/build/", "/src/") + "ReolinkSpotlightNode.html",
    package: "@theotherwillembotha/node-red-reolink",
    templates: [
        { template: LoggerTemplate, config: {}},
        { template: MetricsTemplate, config: {}}
    ],
    dependencies: [ ReolinkConfigNode ],
    tags: [ "Reolink" ]
})
export class ReolinkSpotlightNode extends BaseNode<ReolinkSpotlightNodeConfig> {
    
    @Logger()
    private log!:Log;
    
    @Metrics({name:"request",type:MetricType.Counter, description:"number of requests made"})
    private counter!:CounterMetric;

    private _reolinkConfigNode: ReolinkConfigNode;

    constructor(node: Node, config: ReolinkSpotlightNodeConfig){
        super(node, config);

        // get a reference to the reolink clients.
        this._reolinkConfigNode = (NodeManager.RED.nodes.getNode(config.reolinkconfig) as any).node();
    }

    @onInput()
    protected async onInput(message:any, errorHandler:Function){
        try{
            // if on is not true or false, dont handle this message.
            if(!(message.on === true || message.on === false)){
                return;
            }

            // if message.device is null, then we will use the configured list of devices instead.
            let devices:string[] = (message.device)
                ? [message.device]
                : this.config().selectedDevices;

            this.log.log(message);
            devices.forEach(device => {
                this.counter.inc();
                this._reolinkConfigNode.serviceInstance().switchSpotlight(device, message.on);
            });
        }
        catch(e){
            this.node().error(e);
        }
    }
}
