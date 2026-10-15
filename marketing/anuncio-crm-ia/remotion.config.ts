import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setConcurrency(4);
// No ambiente de nuvem usamos o Chromium já instalado; em outra máquina,
// apague esta linha e o Remotion baixa o navegador sozinho.
if (process.env.REMOTION_CHROME) Config.setBrowserExecutable(process.env.REMOTION_CHROME);
