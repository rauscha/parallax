import { mount } from "svelte";
import "./ui/themes/tokens.css";
import "./ui/themes/base.css";
import "./state/theme";       // attach theme → <html data-theme=…> subscriber
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("#app root element missing from index.html");

const app = mount(App, { target });
export default app;
