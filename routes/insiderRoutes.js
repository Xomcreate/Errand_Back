const express = require("express");
const router = express.Router();
const { subscribeInsider, getSubscribers } = require("../controllers/insiderController");

router.post("/", subscribeInsider);
router.get("/", getSubscribers);

module.exports = router;
