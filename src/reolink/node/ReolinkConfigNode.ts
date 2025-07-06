
import { Node } from "node-red";
import { ConfigNode, ConfigNodeConfig, EndpointMethodType, NodeDescription, NodeManager, SourceUtility, WebhookServerConfig } from "@theotherwillembotha/node-red-plugincore";
import { WebhookTemplate, WebhookTemplateConfig, Webhook}  from "@theotherwillembotha/node-red-plugincore";
import { UIHelperTemplate } from "@theotherwillembotha/node-red-plugincore";
import { ReolinkService, ServiceInstanceFacade } from "../service/ReolinkService";

import { Request, Response} from "express"
import { randomUUID } from "crypto";
import os from "os";


interface ReolinkConfigNodeConfig extends ConfigNodeConfig, WebhookTemplateConfig {
    // the list of connections are manged and saved on the ReolinkConfigNodeConfing,
    // but they are deployed using the ReolinkService outside the flow lifecycle.
    connections:{url:string,username:string,password:string}[],

    // webhook info for callback
    webhook:string;
    webhookPath:string;
}

@NodeDescription({
    id:"ReolinkConfigNode",
    name:"Reolink Config Node",
    group:"config",
    sourceFile:SourceUtility.getSourcePath("/build/", "/src/") + "ReolinkConfigNode.html",
    package: "@theotherwillembotha/node-red-reolink",
    templates: [
        { template: WebhookTemplate, config: {isConfigNode:true}},
        { template: UIHelperTemplate, config: {}}
    ],
    dependencies: [ ReolinkService ],
    tags: [ "Reolink" ]
})
export class ReolinkConfigNode extends ConfigNode<ReolinkConfigNodeConfig> {

    private _listeners:{id:string, devices:string[], listener:((event:any)=>void|Promise<void>)}[] = [];
    private _serviceInstance!:ServiceInstanceFacade;

    constructor(node: Node, config: ReolinkConfigNodeConfig){
        super(node, config);

         // update the ReolinkService on the server.
        this._serviceInstance = ReolinkService.get(this.config().id);
    }

    @Webhook({name:"ReolinkConfigNode", methods:[EndpointMethodType.GET, EndpointMethodType.POST]})
    private onWebhookRequest(request:Request, response:Response):void {
        this._listeners.forEach(listener => {
            try{
                listener.listener(request.body);
            }
            catch(error){
                this.node().error(error);
            }
        });
    }

    public registerEventListener(devices:string[], listener:(event:any)=>void|Promise<void>):{id:string} {
        // add the listener to the list of listeners.
        let subscriber = {id:randomUUID(), devices:devices, listener:listener};
        this._listeners.push(subscriber);
        // check which devices are currently subscribed.
        let deviceSubscriptions = [...new Set(this._listeners.flatMap(entry => entry.devices))];

        // build the target webhook url.
        // If a reverse proxy is configured, the camera must call the proxy's external domain.
        // Otherwise fall back to the webhook server's own external host and port.
        // TODO: support https when the proxy or external server is configured for it.
        let targetWebhook: string;
        if (this.config().reverseProxies_enabled && this.config().reverseProxies_connections.length > 0) {
            let firstProxy = this.config().reverseProxies_connections[0];
            targetWebhook = "http://" + firstProxy.domainname + this.config().webhookPath;
        } else {
            let webserverConfig:WebhookServerConfig = (NodeManager.RED.nodes.getNode(this.config().webhook) as any).node().config();
            targetWebhook = "http://" + os.hostname() + ":" + webserverConfig.externalPort + this.config().webhookPath;
        }

        deviceSubscriptions.forEach(async deviceId =>  {
            let webhooks = await this._serviceInstance.getWebhooks(deviceId);
            let foundWebhook = webhooks.find(webhook => webhook.hookUrl === targetWebhook && webhook);
            if(foundWebhook){
                if(foundWebhook.indexEnable !== 1){
                    foundWebhook.channel = 0;
                    foundWebhook.indexEnable = 1;
                    this._serviceInstance.setWebhook(deviceId, foundWebhook)
                }
                else{
                }
            }
            else {
                // find an unused webhook slot.
                let unusedWebhooks = webhooks.filter(webhook => webhook.hookUrl === "" || webhook.indexEnable != 0);
                if(unusedWebhooks.length === 0){
                    this.node().error("There are no unused webhooks. Remove one and try again.");
                }
                else{
                    let webhook = unusedWebhooks[0];
                    webhook.hookUrl = targetWebhook;
                    webhook.indexEnable = 1;
                    webhook.channel = 0;
                    this._serviceInstance.setWebhook(deviceId, webhook)
                }
            }
        })

        return subscriber;

        // TODO: we're going to have to make a plan with storing the current webhook server and webhook configureation.
        // this is important, because if the current webhook changes, we will have to remove the previous webhook on reolink devices,
        // and then replace it with the new one.
    }

    public deregisterEventListener(subsciber:{id:string}){
        let offset = this._listeners.findIndex(listener => listener.id === subsciber.id);
        this._listeners.splice(offset, 1);
    }

    public serviceInstance():ServiceInstanceFacade{
        return this._serviceInstance;
    }
}
