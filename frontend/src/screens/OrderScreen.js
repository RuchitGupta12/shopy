import Axios from 'axios';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useParams } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { deliverOrder, detailsOrder, payOrder } from '../actions/orderActions';
import LoadingBox from '../components/LoadingBox';
import MessageBox from '../components/MessageBox';
import {
  ORDER_DELIVER_RESET,
  ORDER_PAY_RESET,
} from '../constants/orderConstants';

// ── Extracted as a top-level component so React doesn't unmount/remount it ──
function PaymentForm({ order, clientSecret }) {
  const stripe = useStripe();
  const elements = useElements();
  const dispatch = useDispatch();
  const userSignin = useSelector((state) => state.userSignin);
  const { userInfo } = userSignin;
  const [cardError, setCardError] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  const submitHandler = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessingPayment(true);
    setCardError('');

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setCardError('Card element not ready. Please try again.');
      setProcessingPayment(false);
      return;
    }

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: {
          name: userInfo.name,
          email: userInfo.email,
        },
      },
    });

    if (result.error) {
      setCardError(result.error.message);
      setProcessingPayment(false);
    } else {
      if (
        result.paymentIntent &&
        result.paymentIntent.status === 'succeeded'
      ) {
        // Send paymentResult to backend to mark order as paid
        dispatch(
          payOrder(order, {
            paymentResult: {
              id: result.paymentIntent.id,
              status: result.paymentIntent.status,
              email_address: userInfo.email,
            },
          })
        );
      }
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': { color: '#aab7c4' },
      },
      invalid: { color: '#9e2146' },
    },
  };

  return (
    <form onSubmit={submitHandler}>
      <div style={{ padding: '10px 0' }}>
        <CardElement options={cardElementOptions} />
      </div>
      {cardError && <MessageBox variant="danger">{cardError}</MessageBox>}
      <div>
        <button
          className="primary block"
          type="submit"
          disabled={processingPayment || !stripe}
        >
          {processingPayment
            ? 'Processing...'
            : `Pay $${order.totalPrice.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
}

// ── Wrapper fetches clientSecret then renders PaymentForm ──
function OrderPaymentWrapper({ order }) {
  const userSignin = useSelector((state) => state.userSignin);
  const { userInfo } = userSignin;
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const createPaymentIntent = async () => {
      try {
        const { data } = await Axios.post(
          `/api/orders/${order._id}/create-payment-intent`,
          {},
          {
            headers: { Authorization: `Bearer ${userInfo.token}` },
          }
        );
        if (!cancelled) {
          setClientSecret(data.clientSecret);
        }
      } catch (err) {
        console.error('PaymentIntent error:', err);
        if (!cancelled) {
          setError(
            err.response && err.response.data.message
              ? err.response.data.message
              : err.message
          );
        }
      }
    };
    if (order && !order.isPaid) {
      createPaymentIntent();
    }
    return () => {
      cancelled = true;
    };
  }, [order, userInfo.token]);

  if (error) return <MessageBox variant="danger">{error}</MessageBox>;
  if (!clientSecret) return <LoadingBox />;
  return <PaymentForm order={order} clientSecret={clientSecret} />;
}

// ── Main OrderScreen component ──
export default function OrderScreen(props) {
  const params = useParams();
  const { id: orderId } = params;

  const [stripePromise, setStripePromise] = useState(null);

  const orderDetails = useSelector((state) => state.orderDetails);
  const { order, loading, error } = orderDetails;
  const userSignin = useSelector((state) => state.userSignin);
  const { userInfo } = userSignin;

  const orderPay = useSelector((state) => state.orderPay);
  const {
    loading: loadingPay,
    error: errorPay,
    success: successPay,
  } = orderPay;
  const orderDeliver = useSelector((state) => state.orderDeliver);
  const {
    loading: loadingDeliver,
    error: errorDeliver,
    success: successDeliver,
  } = orderDeliver;
  const dispatch = useDispatch();

  useEffect(() => {
    const fetchStripeKey = async () => {
      try {
        const { data } = await Axios.get('/api/config/stripe');
        if (data) {
          setStripePromise(loadStripe(data));
        }
      } catch (err) {
        console.error('Failed to load Stripe key:', err);
      }
    };

    if (
      !order ||
      successPay ||
      successDeliver ||
      (order && order._id !== orderId)
    ) {
      dispatch({ type: ORDER_PAY_RESET });
      dispatch({ type: ORDER_DELIVER_RESET });
      dispatch(detailsOrder(orderId));
    } else {
      if (!order.isPaid && !stripePromise) {
        fetchStripeKey();
      }
    }
  }, [dispatch, orderId, stripePromise, successPay, successDeliver, order]);

  const deliverHandler = () => {
    dispatch(deliverOrder(order._id));
  };

  return loading ? (
    <LoadingBox></LoadingBox>
  ) : error ? (
    <MessageBox variant="danger">{error}</MessageBox>
  ) : (
    <div>
      <h1>Order {order._id}</h1>
      <div className="row top">
        <div className="col-2">
          <ul>
            <li>
              <div className="card card-body">
                <h2>Shipping</h2>
                <p>
                  <strong>Name:</strong> {order.shippingAddress.fullName} <br />
                  <strong>Address: </strong> {order.shippingAddress.address},
                  {order.shippingAddress.city},{' '}
                  {order.shippingAddress.postalCode},
                  {order.shippingAddress.country}
                </p>
                {order.isDelivered ? (
                  <MessageBox variant="success">
                    Delivered at {order.deliveredAt}
                  </MessageBox>
                ) : (
                  <MessageBox variant="danger">Not Delivered</MessageBox>
                )}
              </div>
            </li>
            <li>
              <div className="card card-body">
                <h2>Payment</h2>
                <p>
                  <strong>Method:</strong> {order.paymentMethod}
                </p>
                {order.isPaid ? (
                  <MessageBox variant="success">
                    Paid at {order.paidAt}
                  </MessageBox>
                ) : (
                  <MessageBox variant="danger">Not Paid</MessageBox>
                )}
              </div>
            </li>
            <li>
              <div className="card card-body">
                <h2>Order Items</h2>
                <ul>
                  {order.orderItems.map((item) => (
                    <li key={item.product}>
                      <div className="row">
                        <div>
                          <img
                            src={item.image}
                            alt={item.name}
                            className="small"
                          ></img>
                        </div>
                        <div className="min-30">
                          <Link to={`/product/${item.product}`}>
                            {item.name}
                          </Link>
                        </div>

                        <div>
                          {item.qty} x ${item.price} = ${item.qty * item.price}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          </ul>
        </div>
        <div className="col-1">
          <div className="card card-body">
            <ul>
              <li>
                <h2>Order Summary</h2>
              </li>
              <li>
                <div className="row">
                  <div>Items</div>
                  <div>${order.itemsPrice.toFixed(2)}</div>
                </div>
              </li>
              <li>
                <div className="row">
                  <div>Shipping</div>
                  <div>${order.shippingPrice.toFixed(2)}</div>
                </div>
              </li>
              <li>
                <div className="row">
                  <div>Tax</div>
                  <div>${order.taxPrice.toFixed(2)}</div>
                </div>
              </li>
              <li>
                <div className="row">
                  <div>
                    <strong> Order Total</strong>
                  </div>
                  <div>
                    <strong>${order.totalPrice.toFixed(2)}</strong>
                  </div>
                </div>
              </li>
              {!order.isPaid && (
                <li>
                  {!stripePromise ? (
                    <LoadingBox></LoadingBox>
                  ) : (
                    <>
                      {errorPay && (
                        <MessageBox variant="danger">{errorPay}</MessageBox>
                      )}
                      {loadingPay && <LoadingBox></LoadingBox>}
                      {successPay && (
                        <MessageBox variant="success">
                          Payment Successful!
                        </MessageBox>
                      )}
                      {/* Stripe Elements with memoized stripe promise */}
                      <Elements stripe={stripePromise}>
                        <OrderPaymentWrapper order={order} />
                      </Elements>
                    </>
                  )}
                </li>
              )}
              {order.isPaid && !order.isDelivered && (
                <li>
                  {loadingDeliver && <LoadingBox></LoadingBox>}
                  {errorDeliver && (
                    <MessageBox variant="danger">{errorDeliver}</MessageBox>
                  )}
                  <button
                    type="button"
                    className="primary block"
                    onClick={deliverHandler}
                  >
                    Deliver Order
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
