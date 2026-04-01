const Insider = require("../models/insiderModel");

exports.subscribeInsider = async (req, res) => {
  try {
    const { email, agreed } = req.body;

    if (!email) return res.status(400).json({ msg: "Email is required" });
    if (!agreed) return res.status(400).json({ msg: "Agreement required" });

    const exists = await Insider.findOne({ email });
    if (exists)
      return res.status(400).json({ msg: "Email already subscribed" });

    const signup = await Insider.create({ email, agreed });

    return res.status(201).json({
      msg: "Subscribed successfully",
      data: signup,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: error.message });
  }
};

exports.getSubscribers = async (req, res) => {
  try {
    const list = await Insider.find().sort({ createdAt: -1 });
    return res.status(200).json(list);
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};
