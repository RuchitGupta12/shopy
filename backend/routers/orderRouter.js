import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import Order from '../models/orderModel.js';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';
import Stripe from 'stripe';
import {
  isAdmin,
  isAuth,
  isSellerOrAdmin,
  mailgun,
  payOrderEmailTemplate,
} from '../utils.js';

const orderRouter = express.Router();
orderRouter.get(
  '/',
  isAuth,
  isSellerOrAdmin,
  expressAsyncHandler(async (req, res) => {
    const seller = req.query.seller || '';
    const sellerFilter = seller ? { seller } : {};

    const orders = await Order.find({ ...sellerFilter }).populate(
      'user',
      'name'
    );
    res.send(orders);
  })
);

orderRouter.get(
  '/summary',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const orders = await Order.aggregate([
      {
        $group: {
          _id: null,
          numOrders: { $sum: 1 },
          totalSales: { $sum: '$totalPrice' },
        },
      },
    ]);
    const users = await User.aggregate([
      {
        $group: {
          _id: null,
          numUsers: { $sum: 1 },
        },
      },
    ]);
    const dailyOrders = await Order.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          sales: { $sum: '$totalPrice' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const productCategories = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
    ]);
    res.send({ users, orders, dailyOrders, productCategories });
  })
);

orderRouter.get(
  '/mine',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id });
    res.send(orders);
  })
);

orderRouter.post(
  '/',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    if (req.body.orderItems.length === 0) {
      res.status(400).send({ message: 'Cart is empty' });
    } else {
      const order = new Order({
        seller: req.body.orderItems[0].seller,
        orderItems: req.body.orderItems,
        shippingAddress: req.body.shippingAddress,
        paymentMethod: req.body.paymentMethod,
        itemsPrice: req.body.itemsPrice,
        shippingPrice: req.body.shippingPrice,
        taxPrice: req.body.taxPrice,
        totalPrice: req.body.totalPrice,
        user: req.user._id,
      });
      const createdOrder = await order.save();
      res
        .status(201)
        .send({ message: 'New Order Created', order: createdOrder });
    }
  })
);

// Create a PaymentIntent for an order (Stripe PaymentIntents flow)
orderRouter.post(
  '/:id/create-payment-intent',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).send({ message: 'Order Not Found' });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const amount = Math.round(order.totalPrice * 100);
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        metadata: { order_id: order._id.toString() },
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  })
);

orderRouter.get(
  '/:id',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (order) {
      res.send(order);
    } else {
      res.status(404).send({ message: 'Order Not Found' });
    }
  })
);

orderRouter.put(
  '/:id/pay',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate(
      'user',
      'email name'
    );
    if (order) {
      // PaymentIntents flow: client confirms payment and sends paymentResult.id
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      try {
        if (!req.body.paymentResult || !req.body.paymentResult.id) {
          return res.status(400).send({ message: 'Payment information missing' });
        }

        // Validate PaymentIntent status from Stripe
        const pi = await stripe.paymentIntents.retrieve(req.body.paymentResult.id);
        if (pi && (pi.status === 'succeeded' || pi.status === 'requires_capture')) {
          order.isPaid = true;
          order.paidAt = Date.now();
          order.paymentResult = {
            id: pi.id,
            status: pi.status,
            update_time: new Date().toISOString(),
            email_address: req.body.paymentResult.email_address || '',
          };
        } else {
          return res.status(400).send({ message: 'Payment not completed. Stripe status: ' + (pi ? pi.status : 'unknown') });
        }

        const updatedOrder = await order.save();
        try {
          if (process.env.MAILGUN_API_KEY) {
            mailgun()
              .messages()
              .send(
                {
                  from: 'Shopy <shopy@mg.yourdomain.com>',
                  to: `${order.user.name} <${order.user.email}>`,
                  subject: `New order ${order._id}`,
                  html: payOrderEmailTemplate(order),
                },
                (error, body) => {
                  if (error) {
                    console.log('Mailgun error:', error);
                  } else {
                    console.log('Email sent:', body);
                  }
                }
              );
          } else {
            console.log('Mailgun not configured — skipping order confirmation email');
          }
        } catch (err) {
          console.log('Email send failed:', err.message);
        }
        res.send({ message: 'Order Paid', order: updatedOrder });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    } else {
      res.status(404).send({ message: 'Order Not Found' });
    }
  })
);

orderRouter.delete(
  '/:id',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (order) {
      const deleteOrder = await order.remove();
      res.send({ message: 'Order Deleted', order: deleteOrder });
    } else {
      res.status(404).send({ message: 'Order Not Found' });
    }
  })
);

orderRouter.put(
  '/:id/deliver',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (order) {
      order.isDelivered = true;
      order.deliveredAt = Date.now();

      const updatedOrder = await order.save();
      res.send({ message: 'Order Delivered', order: updatedOrder });
    } else {
      res.status(404).send({ message: 'Order Not Found' });
    }
  })
);

export default orderRouter;
