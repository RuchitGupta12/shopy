import React, { useEffect, useRef, useState } from 'react';
import socketIOClient from 'socket.io-client';
import { useSelector } from 'react-redux';
import MessageBox from '../components/MessageBox';

const ENDPOINT =
  window.location.host.indexOf('localhost') >= 0
    ? 'http://127.0.0.1:5000'
    : window.location.host;

export default function SupportScreen() {
  const [selectedUser, setSelectedUser] = useState({});
  const [socket, setSocket] = useState(null);
  const uiMessagesRef = useRef(null);
  const [messageBody, setMessageBody] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const allMessagesRef = useRef([]);
  const allUsersRef = useRef([]);
  const allSelectedUserRef = useRef({});
  const userSignin = useSelector((state) => state.userSignin);
  const { userInfo } = userSignin;

  useEffect(() => {
    if (uiMessagesRef.current) {
      uiMessagesRef.current.scrollBy({
        top: uiMessagesRef.current.clientHeight,
        left: 0,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  useEffect(() => {
    if (socket) {
      return;
    }
    const sk = socketIOClient(ENDPOINT);
    setSocket(sk);
    sk.emit('onLogin', {
      _id: userInfo._id,
      name: userInfo.name,
      isAdmin: userInfo.isAdmin,
    });
    sk.on('message', (data) => {
      if (allSelectedUserRef.current._id === data._id) {
        allMessagesRef.current = [...allMessagesRef.current, data];
      } else {
        const existUser = allUsersRef.current.find((user) => user._id === data._id);
        if (existUser) {
          allUsersRef.current = allUsersRef.current.map((user) =>
            user._id === existUser._id ? { ...user, unread: true } : user
          );
          setUsers(allUsersRef.current);
        }
      }
      setMessages(allMessagesRef.current);
    });
    sk.on('updateUser', (updatedUser) => {
      const existUser = allUsersRef.current.find((user) => user._id === updatedUser._id);
      if (existUser) {
        allUsersRef.current = allUsersRef.current.map((user) =>
          user._id === existUser._id ? updatedUser : user
        );
      } else {
        allUsersRef.current = [...allUsersRef.current, updatedUser];
      }
      setUsers(allUsersRef.current);
    });
    sk.on('listUsers', (updatedUsers) => {
      allUsersRef.current = updatedUsers;
      setUsers(allUsersRef.current);
    });
    sk.on('selectUser', (user) => {
      allMessagesRef.current = user ? user.messages : [];
      setMessages(allMessagesRef.current);
    });
    return () => {
      sk.disconnect();
    };
  }, [socket, userInfo]);

  const selectUser = (user) => {
    allSelectedUserRef.current = user;
    setSelectedUser(user);
    const existUser = allUsersRef.current.find((x) => x._id === user._id);
    if (existUser) {
      allUsersRef.current = allUsersRef.current.map((x) =>
        x._id === existUser._id ? { ...x, unread: false } : x
      );
      setUsers(allUsersRef.current);
    }
    if (socket) {
      socket.emit('onUserSelected', user);
    }
  };

  const submitHandler = (e) => {
    e.preventDefault();
    if (!messageBody.trim()) {
      alert('Error. Please type message.');
      return;
    }
    const body = messageBody;
    allMessagesRef.current = [
      ...allMessagesRef.current,
      { body, name: userInfo.name },
    ];
    setMessages(allMessagesRef.current);
    setMessageBody('');
    setTimeout(() => {
      socket.emit('onMessage', {
        body,
        name: userInfo.name,
        isAdmin: userInfo.isAdmin,
        _id: selectedUser._id,
      });
    }, 1000);
  };

  return (
    <div className="row top full-container">
      <div className="col-1 support-users">
        {users.filter((x) => x._id !== userInfo._id).length === 0 && (
          <MessageBox>No Online User Found</MessageBox>
        )}
        <ul>
          {users
            .filter((x) => x._id !== userInfo._id)
            .map((user) => (
              <li
                key={user._id}
                className={user._id === selectedUser._id ? '  selected' : '  '}
              >
                <button
                  className="block"
                  type="button"
                  onClick={() => selectUser(user)}
                >
                  {user.name}
                </button>
                <span
                  className={
                    user.unread ? 'unread' : user.online ? 'online' : 'offline'
                  }
                />
              </li>
            ))}
        </ul>
      </div>
      <div className="col-3 support-messages">
        {!selectedUser._id ? (
          <MessageBox>Select a user to start chat</MessageBox>
        ) : (
          <div>
            <div className="row">
              <strong>Chat with {selectedUser.name} </strong>
            </div>
            <ul ref={uiMessagesRef}>
              {messages.length === 0 && <li>No message.</li>}
              {messages.map((msg, index) => (
                <li key={index}>
                  <strong>{`${msg.name}: `}</strong> {msg.body}
                </li>
              ))}
            </ul>
            <div>
              <form onSubmit={submitHandler} className="row">
                <input
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  type="text"
                  placeholder="type message"
                />
                <button type="submit">Send</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
