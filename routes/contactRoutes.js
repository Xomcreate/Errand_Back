const express = require("express");
const router = express.Router();
const {
  createContact,
  getMessages,
  deleteMessage,
  replyToMessage,
   updateStatus 
} = require("../controllers/contactController");

router.post("/", createContact);               // create message
router.get("/", getMessages);                  // get messages
router.delete("/:id", deleteMessage);         // delete message
router.post("/reply/:id", replyToMessage);  
router.patch("/status/:id", updateStatus);  // send reply

module.exports = router;
