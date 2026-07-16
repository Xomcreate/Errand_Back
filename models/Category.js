import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  isVisible: { type: Boolean, default: true },
  image: { type: String, default: null },
  imagePublicId: { type: String, default: null },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
});

export default mongoose.model("Category", CategorySchema);