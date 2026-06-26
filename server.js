const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 4173;
const rootDir = __dirname;

app.use(express.static(rootDir, { extensions: ["html"] }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Holodeck server listening on port ${port}`);
});
