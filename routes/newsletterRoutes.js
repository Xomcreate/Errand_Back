import express from "express";
import { subscribeNewsletter, getSubscribers } from "../controllers/newsletterController.js";

const router = express.Router();

// POST new subscription
router.post("/", subscribeNewsletter);

// GET all subscribers (optional, for admin)
router.get("/", getSubscribers);

export default router;
