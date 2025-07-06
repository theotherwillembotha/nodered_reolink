import axios from "axios";
import { ChannelStatus, ReolinkClient } from "./ReolinkClient";

export class ReolinkDefaultClient extends ReolinkClient {

    static async connect(url: string, userName: string, password: string):Promise<ReolinkDefaultClient> {
        // note: this function will only work with the basic functions of the API that are not encrypted.
        return new ReolinkDefaultClient(url, userName, password).login();
    }

    private token?: string;

    private constructor(url:string, username:string, password:string){
        super(url, username, password);
    }
    
    private async login(): Promise<ReolinkDefaultClient> {
        let request = [{
            cmd: "Login",
            param: { User: { Version: "0", userName: this.username(), password: this.password() }}
        }];

        return axios.post<Response<Token>[]>(`${this.url()}/api.cgi?cmd=Login`, request, {})
            .then(response => {
            if(!!response.data[0].code){
                console.error("ERROR", JSON.stringify(response.data[0]));
                throw Error(response.data[0].error.detail);
            }
            this.token = response.data[0].value.Token.name
        })
        // after performing the login, find the type of the camera / device, as this will determine if we need use the encrypted api.
        .then(() => this);
    }

    protected async  sendRequest<ResponseType>(command:string, request:any, parse?:(value:{[key:string]:any}) => ResponseType){
        return axios.post<Response<{[key:string]:ResponseType}>[]>(`${this.url()}/api.cgi?cmd=${command}&token=${this.token}`, request, {})
        .then(response => {
            // check for error codes first.
            if(response.data[0].code && response.data[0].error){
                throw new Error(`Error performing Command: ${command} on ${this.url()} "${response.data[0].error.detail}"`);
            }
            return (parse)
                ? parse(response.data[0].value)
                : Object.values(response.data[0].value)[0];
        });
    }

    protected async performGet<ResponseType>(command:string, request:any):Promise<ResponseType>{
        return axios.get(`${this.url()}/api.cgi?cmd=${command}&token=${this.token}`, { responseType: 'arraybuffer' })
            .then(response => {
                return Buffer.from(response.data, 'binary') as any as ResponseType
            });
    }

    /*
    // ************************************ IMPLEMENTATION SPECIFIC FUNCTIONS ************************************ //
    public async getChannelStatus():Promise<ChannelStatus>{
        return axios.get<Response<ChannelStatus>[]>(`${this.url()}/api.cgi?cmd=Getchannelstatus&token=${this.token}`, {})
        .then(response => {
            console.log("getChannelStatus", JSON.stringify(response.data));
            //return response.data[0].value.status.filter(status => !!status.uid);
            return {} as ChannelStatus;

        });
    }
    */
}


interface Response<Type>{
    cmd:string,
    code:number,
    value:Type,
    error:ErrorData
}

interface Token{
    Token:{
        leaseTime:number,
        name:string
    }
}

interface ErrorData { 
    detail:string
}
