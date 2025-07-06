import { NodeAPI, NodeAPISettingsWithData } from "node-red";
import { BaseService, FlowDeployment, ServiceDescriptor } from "@theotherwillembotha/node-red-plugincore"
import { AbilityInfo, ChannelInfo, DeviceInfo, DeviceType, P2PId, ReolinkClient, SirenConfig, WebhookConfig } from "../ReolinkClient";
import { ReolinkAPI } from "../ReolinkAPI";

export class ServiceInstanceFacade {
    
    private instance: ServiceInstance;
    
    constructor(instance:ServiceInstance){
        this.instance = instance;
    }

    public async getWebhooks(device:string):Promise<WebhookConfig[]> {
        return this.instance.onUpdateComplete().then(s => s.client(device).getWebhooks());
    }

    public async setWebhook(device:string, webhook: WebhookConfig):Promise<void> {
        return this.instance.onUpdateComplete()
            .then(s => s.client(device).setWebhook(webhook))
            .then();
    }

    public async switchSpotlight(device:string, on:boolean):Promise<void> {
        return this.instance.onUpdateComplete().then(s => {
            let client = s.client(device);
            client.getWhiteLED()
                .then(async led => {
                    led.state = (on) ? 1 : 0
                    return client.setWhiteLED(led);
                });
        })
    }

    public async getChannels():Promise<{[key:string]:Channel}> {
        return this.instance.onUpdateComplete().then(s => {
            let channels:{[key:string]:Channel} = {};
            s.channels().forEach(c => channels[c.uid] = c);
            return channels;
        });
    }

    public async getSnapshot(channelUID: string):Promise<Buffer> {
        return  this.instance.onUpdateComplete().then(s => {
            let channel = s.channels().find(c => c.uid === channelUID);
            if(!channel){
                return Promise.reject("Could not find Channel '" +  channelUID+ "'");
            }
            let device = channel?.devices[0]!;
            return this.instance.client(device.deviceURL).snapImage(device.channel);
        })
    }

    public async switchSiren(device:string, on:boolean):Promise<number> {
        return this.instance.onUpdateComplete().then(s => {
            let client = s.client(device);
            //client.getSiren().then(async siren => {
            let siren:SirenConfig = {
                alarm_mode: "manul",
                channel: 0,
                manual_switch : (on) ? 1 : 0
            }
            return client.setSiren(siren);
        })
    }
}

export class ReolinkService extends BaseService {

    private red!: NodeAPI<NodeAPISettingsWithData>;
    private static serviceInstances:{[key:string]:ServiceInstance} = {};

    constructor(){
        super("ReolinkService");
    }

    static get(id: string):ServiceInstanceFacade {
        let instance:ServiceInstance = ReolinkService.serviceInstances[id];
        return new ServiceInstanceFacade(instance);
    }

    public init(red: NodeAPI<NodeAPISettingsWithData>): void {
        this.red = red;
        
        // update the config/
        this.red.httpAdmin.post("/reolinkservice/config", this.red.auth.needsPermission("inject.write"), (request,response) => {
            this.updateConfig(request.body).then(output => response.send(output));
        });

        // verify a connection
        this.red.httpAdmin.post("/reolinkservice/testconnection", this.red.auth.needsPermission("inject.write"), (request,response) => {
            this.testConnection(request.body).then(output => response.send(output));
        });

        // get the connection statuses.
        this.red.httpAdmin.post("/reolinkservice/connectionstatus", this.red.auth.needsPermission("inject.write"), async (request,response) => {
            let serviceInstance = ReolinkService.serviceInstances[request.body.id];
            if(serviceInstance){
                let devices = await serviceInstance.devices();
                response.send(devices.map(device => { return { 
                    url:device.config.url, 
                    success:true 
                }}));
            }
            else{
                response.send([]);
            } 
        });

        // find devices using the given selection criteria
        this.red.httpAdmin.post("/reolinkservice/findDevices", this.red.auth.needsPermission("inject.write"), async (request,response) => {
            let findDeviceRequest:{id:string, ability:keyof ChannelInfo} = request.body;

            let serviceInstance = ReolinkService.serviceInstances[findDeviceRequest.id];
            if(serviceInstance){
                let devices:Device[] = [];
                serviceInstance.channels().forEach(channel => {
                    let foundDevice = channel.devices.find(device => !!device.abilities[findDeviceRequest.ability])
                    if(foundDevice){
                        let device = serviceInstance.devices().find(d => d.config.url === foundDevice.deviceURL)!;
                        devices.push(device);
                    }
                });

                response.send(devices.map(device => { 
                    return {
                        device: device.config.url,
                        name:device.deviceInfo.name}
                    }
                ));
            }
            else{
                response.send([]);
            } 
        });

        this.red.httpAdmin.post("/reolinkservice/channellist", this.red.auth.needsPermission("inject.write"), async (request,response) => {
            let devices:DeviceConfig[] = request.body.connections;
            let channels:{[key:string]:Channel} = await ReolinkService.getChannelList(devices);
            response.send(channels);
        });
    }
    
    public static async getChannelList(devices: DeviceConfig[]): Promise<{[key: string]: Channel}> {
        let channels:{[key:string]:Channel} = {};
        for(let device of devices){
            let client = await ReolinkAPI.connect(device.url, device.username, device.password);
            // get the ability info for the device.
            let abilityInfo:AbilityInfo = await client.getAbility();
            let deviceInfo:DeviceInfo = await client.getDeviceInfo();

            // process the NVRs
            if(deviceInfo.type === DeviceType.NVR){
                let channelStatuses = await client.getChannelStatus();
                for(let c of channelStatuses){
                    if(c.uid === ""){ continue; }
                    let channel = channels[c.uid!];
                    if(!channel){
                        channels[c.uid!] = channel = {
                            name:c.name,
                            uid:c.uid!,
                            devices:[]
                        }
                    }
                    channel.devices.push({
                        deviceURL:device.url,
                        channel:c.channel,
                        abilities:abilityInfo.channels[c.channel]
                    })
                }
            }
            // process the IPCs
            if(deviceInfo.type === DeviceType.IPC){
                let p2p:P2PId = await client.getP2PId();
                let channel = channels[p2p.uid];
                if(!channel){
                    channels[p2p.uid] = channel = {
                        name:deviceInfo.name,
                        uid:p2p.uid,
                        devices:[]
                    }
                }
                channel.devices.push({
                    deviceURL:device.url,
                    channel:0,
                    abilities:abilityInfo.channels[0]
                })
            }
        }
        return channels;
    }

    public deinit(red: NodeAPI<NodeAPISettingsWithData>): void {
    }

    public async onDeploy(flowDeployment: FlowDeployment): Promise<void> {
        await Promise.all(flowDeployment.flows
            .filter(item => item.type === "ReolinkConfigNode")
            .map(async item => {
                await this.updateConfig({
                    id: item.id,
                    devices: (item as any).connections
                });
            })
        );
    }

    private async testConnection(config:ReolinkServiceConfig):Promise<DeviceClientStatus[]>{
        let results:DeviceClientStatus[] = [];
        let promise = Promise.resolve();
        config.devices.forEach(device => {
            promise = promise.then(() => {
                return ReolinkAPI.connect(device.url, device.username, device.password)
                    .then(client => {
                        results.push({url:device.url, success:true, status:"ok"});
                    })
                    .catch(error => {
                        console.error(error);
                        results.push({url:device.url, success:false, status:"" + error})
                });
            });
        })

        return promise.then(() => results);
    }

    private async updateConfig(config:ReolinkServiceConfig):Promise<DeviceClientStatus[]>{
        // check if we already have an instance of this service.
        let serviceInstance = ReolinkService.serviceInstances[config.id];
        if(!serviceInstance){
            ReolinkService.serviceInstances[config.id] = serviceInstance = new ServiceInstance(config.id);
        }
        return await serviceInstance.update(config.devices);
    }

    static override getServiceDescriptor():ServiceDescriptor {
        return new ServiceDescriptor(
            "@theotherwillembotha/reolinkservice",
            "ReolinkService", 
            "integration-plugin",
            "./reolink/service/ReolinkService",
            ReolinkService);
    }
}

type Device = {
    config:DeviceConfig;
    client:ReolinkClient;
    deviceInfo:DeviceInfo;
}

class ServiceInstance {
    
    private _id: string;
    private _devices:{[key:string]:Device} = {}
    private _channels:{[key:string]:Channel} = {}

    // initalization sync,
    private _onReady!: Promise<ServiceInstance>;
    private _updateComplete:any;

    constructor(id:string){
        this._id = id;
    }

    public async onUpdateComplete():Promise<ServiceInstance>{
        return this._onReady;
    }

    public id(){
        return this._id;
    }

    public devices():Device[] {
        return Object.values(this._devices);
    }

    public channels():Channel[]{
        return Object.values(this._channels);
    }

    public client(url: string):ReolinkClient {
        return this._devices[url].client;
    }

    public async update(deviceConfigs: DeviceConfig[]):Promise<DeviceClientStatus[]> {
        this._onReady = new Promise(r => this._updateComplete = r);

        let deviceClientStatuses:DeviceClientStatus[] = [];
        let channels:{[key:string]:Channel} = {};
        let devices:{[key:string]:Device} = {};

        // build a channel map for each of the devices.
        let promises = deviceConfigs.map(async deviceConfig => {
            try{
                let api = await ReolinkAPI.connect(deviceConfig.url, deviceConfig.username, deviceConfig.password);
                let deviceInfo = await api.getDeviceInfo();
                let channelAbilities = (await api.getAbility()).channels;

                // if this is an IPC, get its p2pID.
                if(deviceInfo.type === DeviceType.IPC){
                    let p2pID = await api.getP2PId();
                    
                    // get the info for this channel    
                    if(!channels[p2pID.uid]){
                        channels[p2pID.uid] = {
                            uid: p2pID.uid,
                            name: deviceInfo.name,
                            devices: []
                        }
                    }

                    channels[p2pID.uid].devices.push({
                        deviceURL:deviceConfig.url,
                        channel: 0,          // defualt channel for IPC.
                        abilities: channelAbilities[0]
                    })

                }
                // if this is an NVR, get the channels.
                if(deviceInfo.type === DeviceType.NVR){
                    let deviceChannels = (await api.getChannelStatus()).filter(c => c.uid !== "");
                    deviceChannels.forEach(deviceChannel => {
                        let uid = deviceChannel.uid!;
                        if(!channels[uid]){
                            channels[uid] = {
                                uid: uid,
                                name: deviceInfo.name,
                                devices: []
                            }
                        }
                        channels[uid].devices.push({
                            deviceURL:deviceConfig.url,
                            channel: deviceChannel.channel,
                            abilities: channelAbilities[deviceChannel.channel]
                        })
                    });
                }

                // add the device to the devices list.
                devices[deviceConfig.url] = {
                    config:deviceConfig,
                    client: api,
                    deviceInfo: deviceInfo
                };

                deviceClientStatuses.push({ url:deviceConfig.url, success:true, status:"ok"});
            }
            catch(error){
                console.error("Failed connecting to reolink device", deviceConfig.url);
                deviceClientStatuses.push({ url:deviceConfig.url, success:false, status:"" + error});
            }
        });

        await Promise.all(promises);

        this._devices = devices;
        this._channels = channels;
    
        this._updateComplete(this);

        return Promise.resolve(deviceClientStatuses);
    }
}

type DeviceClientStatus = {
    url:string,
    success:boolean,
    status:string
}

type DeviceConfig = { 
    url: string; 
    username: string;
    password: string; 
};

export interface ReolinkServiceConfig{
    id:string,
    devices:DeviceConfig[],
}

type Channel = {
    uid:string,         // the uid. should be the same on nvr channels as on ipc p2pid.
    name: string,
    devices:ChannelDevice[]
}

type ChannelDevice = {
    deviceURL:string, 
    channel:number,
    abilities:ChannelInfo
}
