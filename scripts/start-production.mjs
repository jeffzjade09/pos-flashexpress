// Railway sets HOSTNAME to the container id. Next's standalone server would
// bind only to that hostname, so force the public container interface.
process.env.HOSTNAME = "0.0.0.0";

await import("../.next/standalone/server.js");
