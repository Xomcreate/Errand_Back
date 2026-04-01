import Newsletter from "../models/Newsletter.js";

// Subscribe endpoint
export const subscribeNewsletter = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    // Check if email already exists
    const existing = await Newsletter.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already subscribed" });

    const subscriber = await Newsletter.create({ email });
    res.status(201).json({ message: "Subscribed successfully", subscriber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Optional: get all subscribers (admin)
export const getSubscribers = async (req, res) => {
  try {
    const subscribers = await Newsletter.find().sort({ subscribedAt: -1 });
    res.status(200).json(subscribers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
