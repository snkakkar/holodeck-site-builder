const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 4173;
const rootDir = __dirname;

app.get("/", (_req, res) => {
  res.redirect(302, "/builder/");
});

app.get("/demo/", (_req, res) => {
  res.redirect(302, "/builder/");
});

app.use(express.static(rootDir, { extensions: ["html"] }));

app.listen(port, () => {
  console.log(`Holodeck server listening on port ${port}`);
});
