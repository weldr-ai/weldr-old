import health from "./health";
import installIntegrations from "./install-integrations";
import revert from "./revert";
import events from "./stream";
import trigger from "./trigger";

export const routes = [health, trigger, events, installIntegrations, revert];
