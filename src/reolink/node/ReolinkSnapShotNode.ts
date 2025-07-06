import { Node } from "node-red";
import { BaseNode, BaseNodeConfig, GaugeMetric, JsonUtil, MetricsTemplateConfig, NodeDescription, NodeManager, onInput, SourceUtility } from "@theotherwillembotha/node-red-plugincore";
import { Metrics, MetricType, MetricsTemplate, CounterMetric } from "@theotherwillembotha/node-red-plugincore";
import { Log, Logger, LoggerTemplate, LoggerTemplateConfig } from "@theotherwillembotha/node-red-plugincore";
import { ReolinkConfigNode } from "./ReolinkConfigNode";

interface ReolinkSnapshotNodeConfig extends BaseNodeConfig, MetricsTemplateConfig, LoggerTemplateConfig {
    reolinkconfig: string;
    channel:string;
    outputpath:string;
}

@NodeDescription({
    id:"ReolinkSnapshotNode",
    name:"Reolink Snapshot Node",
    group:"reolink",
    sourceFile:SourceUtility.getSourcePath("/build/", "/src/") + "ReolinkSnapshotNode.html",
    package: "@theotherwillembotha/node-red-reolink",
    templates: [
        { template: LoggerTemplate, config: {}},
        { template: MetricsTemplate, config: {}}
    ],
    dependencies: [ ReolinkConfigNode ],
    tags: [ "Reolink" ]
})
export class ReolinkSnapshotNode extends BaseNode<ReolinkSnapshotNodeConfig> {

    @Logger()
    private log!:Log;
    
    @Metrics({name:"request",type:MetricType.Counter, description:"number of requests made"})
    private counter!:CounterMetric;

    @Metrics({name:"backlog",type:MetricType.Gauge, description:"number of snapshot requests in the backlog"})
    private snapshotBacklog!:GaugeMetric;
    
    private _reolinkConfigNode: ReolinkConfigNode;

    constructor(node: Node, config: ReolinkSnapshotNodeConfig){
        super(node, config);

        // get a reference to the reolink clients.
        this._reolinkConfigNode = (NodeManager.RED.nodes.getNode(config.reolinkconfig) as any).node();
    }

    @onInput()
    protected async onInput(message:any, errorHandler:Function){
        // when receiving a message, take a snapshot with with the channel.
        this.snapshotBacklog.inc();
        try{
            let image = await this._reolinkConfigNode.serviceInstance().getSnapshot(this.config().channel);
            this.snapshotBacklog.dec();
            this.log.log("received " + image.length + " bytes");
            this.counter.inc();
            let outputpath = (this.config().outputpath) ? this.config().outputpath : "payload";
            let data = JsonUtil.jsonUpdate(message, outputpath, image);
            this.node().send([data]);
        }
        catch(exception){
            this.snapshotBacklog.dec();
            this.node().error("could not get snapshot from: " + this.config().channel + " " + exception);
            return;
        }
    }
}
