import express from "express";
import dotenv from "dotenv";
dotenv.config();

import config from "./config";
import { Log, refreshToken, setToken } from "./middleware/logger";

const app = express();
app.use(express.json());

// log every request coming in
app.use(async (req, res, next) => {
  await Log("backend", "info", "middleware", `${req.method} ${req.path} received`);
  next();
});

app.get("/health", async (req, res) => {
  await Log("backend", "info", "route", "Health check endpoint called");
  res.json({ status: "ok", service: "affordmed-backend" });
});

app.get("/", async (req, res) => {
  await Log("backend", "info", "route", "Root endpoint called");
  res.json({ message: "AffordMed Campus Notifications Backend is running" });
});

async function start() {
  // get auth token on startup
  if (!config.authToken) {
    console.log("No AUTH_TOKEN in .env, fetching one...");
    try {
      const token = await refreshToken();
      setToken(token);
      await Log("backend", "info", "auth", "Auth token fetched on server startup");
    } catch (err) {
      console.error("Could not get auth token on startup. Set AUTH_TOKEN in .env");
    }
  } else {
    setToken(config.authToken);
    await Log("backend", "info", "auth", "Auth token loaded from environment on startup");
  }

  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}

start();
