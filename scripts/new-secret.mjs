#!/usr/bin/env node
// Prints a long random value, e.g. for SETUP_TOKEN.   npm run secret
import { newToken } from "./lib.mjs";
console.log(newToken());
