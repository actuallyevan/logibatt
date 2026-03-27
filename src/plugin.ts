import streamDeck from "@elgato/streamdeck";

import { Battery } from "./actions/battery";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new Battery());

streamDeck.connect();
