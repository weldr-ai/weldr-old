import health from "./health";
import installIntegrations from "./install-integrations";
import revert from "./revert";
import session from "./session";
import events from "./stream";

export const routes = [health, session, events, installIntegrations, revert];
