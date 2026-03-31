import { Module } from "@nestjs/common";
import { WebsocketCallbackService } from "./websocket-callback.service";

@Module({
    providers: [WebsocketCallbackService],
    exports: [WebsocketCallbackService],
})
export class WebsocketCallbackModule {}
