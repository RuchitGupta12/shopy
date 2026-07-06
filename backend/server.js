import http from 'http';
import { Server } from 'socket.io';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import productRouter from './routers/productRouter.js';
import userRouter from './routers/userRouter.js';
import orderRouter from './routers/orderRouter.js';
import uploadRouter from './routers/uploadRouter.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.set('strictQuery', false);

app.use('/api/uploads', uploadRouter);
app.use('/api/users', userRouter);
app.use('/api/products', productRouter);
app.use('/api/orders', orderRouter);
app.get('/api/config/stripe', (req, res) => {
  res.send(process.env.STRIPE_PUBLISHABLE_KEY || '');
});
app.get('/api/config/google', (req, res) => {
  res.send(process.env.GOOGLE_API_KEY || '');
});
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../frontend/build')));
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'))
);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send({ message: err.message });
});

const port = process.env.PORT || 5000;

const httpServer = http.Server(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const users = [];

io.on('connection', (socket) => {
  console.log('connection', socket.id);

  socket.on('disconnect', () => {
    try {
      const user = users.find((x) => x.socketId === socket.id);
      if (user) {
        user.online = false;
        console.log('Offline', user.name);
        const admin = users.find((x) => x.isAdmin && x.online);
        if (admin && admin.socketId) {
          io.to(admin.socketId).emit('updateUser', user);
        }
      }
    } catch (err) {
      console.error('Socket disconnect error:', err);
    }
  });

  socket.on('onLogin', (user) => {
    try {
      const updatedUser = {
        ...user,
        online: true,
        socketId: socket.id,
        messages: [],
      };
      const existUser = users.find((x) => x._id === updatedUser._id);
      if (existUser) {
        existUser.socketId = socket.id;
        existUser.online = true;
      } else {
        users.push(updatedUser);
      }
      console.log('Online', user.name);
      const admin = users.find((x) => x.isAdmin && x.online);
      if (admin && admin.socketId) {
        io.to(admin.socketId).emit('updateUser', updatedUser);
      }
      if (updatedUser.isAdmin) {
        io.to(updatedUser.socketId).emit('listUsers', users);
      }
    } catch (err) {
      console.error('Socket onLogin error:', err);
    }
  });

  socket.on('onUserSelected', (user) => {
    try {
      const admin = users.find((x) => x.isAdmin && x.online);
      if (admin && admin.socketId) {
        const existUser = users.find((x) => x._id === user._id);
        io.to(admin.socketId).emit('selectUser', existUser);
      }
    } catch (err) {
      console.error('Socket onUserSelected error:', err);
    }
  });

  socket.on('onMessage', (message) => {
    try {
      if (message.isAdmin) {
        const user = users.find((x) => x._id === message._id && x.online);
        if (user) {
          if (user.socketId) {
            io.to(user.socketId).emit('message', message);
          }
          user.messages.push(message);
        }
      } else {
        const admin = users.find((x) => x.isAdmin && x.online);
        if (admin) {
          if (admin.socketId) {
            io.to(admin.socketId).emit('message', message);
          }
          const user = users.find((x) => x._id === message._id && x.online);
          if (user) {
            user.messages.push(message);
          }
        } else {
          io.to(socket.id).emit('message', {
            name: 'Admin',
            body: 'Sorry. I am not online right now',
          });
        }
      }
    } catch (err) {
      console.error('Socket onMessage error:', err);
    }
  });
});

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost/shopy');
    console.log('DB connected');
    httpServer.listen(port, () => {
      console.log(`Serve at http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
