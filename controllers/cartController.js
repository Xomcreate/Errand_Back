import asyncHandler from "express-async-handler";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";

// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private
export const getCart = asyncHandler(async (req, res) => {
  const items = await Cart.find({ user: req.user._id }).populate("product", "name price image inStock category vendor");
  res.json(items);
});

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
export const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;

  if (!productId) {
    res.status(400);
    throw new Error("Product ID is required");
  }

  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  let cartItem = await Cart.findOne({ user: req.user._id, product: productId });

  if (cartItem) {
    // Already in cart → increase quantity
    cartItem.quantity += quantity || 1;
    await cartItem.save();
    return res.status(200).json(cartItem);
  }

  cartItem = await Cart.create({
    user: req.user._id,
    product: productId,
    quantity: quantity || 1,
  });

  res.status(201).json(cartItem);
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/:id
// @access  Private
export const updateCartItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const cartItem = await Cart.findById(req.params.id);

  if (!cartItem) {
    res.status(404);
    throw new Error("Cart item not found");
  }

  if (cartItem.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized");
  }

  cartItem.quantity = quantity;
  await cartItem.save();

  res.json(cartItem);
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:id
// @access  Private
export const removeCartItem = asyncHandler(async (req, res) => {
  const cartItem = await Cart.findById(req.params.id);

  if (!cartItem) {
    res.status(404);
    throw new Error("Cart item not found");
  }

  if (cartItem.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized");
  }

  await cartItem.remove();
  res.json({ message: "Item removed from cart" });
});