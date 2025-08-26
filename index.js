// require('dotenv').config();
// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const axios = require('axios');
// const moment = require('moment');

// const app = express();
// const port = process.env.PORT || 3000;

// // Middleware
// app.use(express.json());
// app.use(cors());

// // Database Models
// const TransactionSchema = new mongoose.Schema({
//   amount: {
//     type: Number,
//     required: true,
//     validate: {
//       validator: function(v) {
//         return v > 0;
//       },
//       message: props => `Amount must be greater than zero. Received: ${props.value}`
//     }
//   },
//   checkoutId: {
//     type: String,
//     required: true
//   },
//   mpesaCode: {
//     type: String,
//     required: true
//   },
//   phoneNumber: {
//     type: String,
//     required: true,
//     validate: {
//       validator: function(v) {
//         return /^254\d{9}$/.test(v);
//       },
//       message: props => `${props.value} is not a valid Kenyan phone number!`
//     }
//   },
//   status: {
//     type: String,
//     required: true,
//     enum: ['Pending', 'Completed', 'Failed'],
//     default: 'Pending'
//   },
//   timestamp: {
//     type: Date,
//     default: Date.now
//   }
// }, {
//   timestamps: true
// });

// // Index for better query performance
// TransactionSchema.index({ mpesaCode: 1, checkoutId: 1, phoneNumber: 1 });

// const Transaction = mongoose.model('Transaction', TransactionSchema);

// const CheckoutRequestSchema = new mongoose.Schema({
//   checkoutRequestID: {
//     type: String,
//     required: true,
//     unique: true
//   },
//   merchantRequestID: {
//     type: String,
//     required: true
//   },
//   phoneNumber: {
//     type: String,
//     required: true
//   },
//   amount: {
//     type: Number,
//     required: true
//   },
//   status: {
//     type: String,
//     enum: ['Requested', 'Processing', 'Completed', 'Failed', 'Timeout'],
//     default: 'Requested'
//   },
//   mpesaReceiptNumber: {
//     type: String,
//     default: null
//   },
//   resultDescription: {
//     type: String,
//     default: null
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now,
//     expires: 3600 // Auto-delete after 1 hour
//   }
// });

// const CheckoutRequest = mongoose.model('CheckoutRequest', CheckoutRequestSchema);

// // Daraja Authentication Middleware
// const darajaAuthMiddleware = async (req, res, next) => {
//   try {
//     const { CONSUMER_KEY, CONSUMER_SECRET, BASE_URL } = process.env;

//     if (!CONSUMER_KEY || !CONSUMER_SECRET || !BASE_URL) {
//       throw new Error('Missing required environment variables for Daraja authentication');
//     }

//     const encodedCredentials = Buffer.from(
//       `${CONSUMER_KEY}:${CONSUMER_SECRET}`
//     ).toString('base64');

//     const response = await axios.get(
//       `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
//       {
//         headers: {
//           Authorization: `Basic ${encodedCredentials}`
//         },
//         timeout: 10000
//       }
//     );

//     if (!response.data || !response.data.access_token) {
//       throw new Error('Failed to retrieve access token from Daraja API');
//     }

//     req.darajaToken = response.data.access_token;
//     next();
//   } catch (error) {
//     console.error('Daraja authentication error:', error.message);
    
//     if (error.response) {
//       return res.status(error.response.status).json({
//         error: error.response.data.errorMessage || 'Daraja API authentication error'
//       });
//     }
    
//     if (error.code === 'ECONNABORTED') {
//       return res.status(504).json({
//         error: 'Daraja API timeout. Please try again.'
//       });
//     }
    
//     res.status(500).json({ 
//       error: 'Failed to authenticate with Daraja API',
//       details: error.message
//     });
//   }
// };

// // API Endpoints

// // 1. Send STK Push and wait for result
// app.post('/api/sendStkPush', darajaAuthMiddleware, async (req, res) => {
//   try {
//     const { phoneNumber, amount } = req.body;

//     // Validate input
//     if (!phoneNumber || !amount) {
//       return res.status(400).json({
//         error: 'Phone number and amount are required'
//       });
//     }

//     if (amount <= 0) {
//       return res.status(400).json({
//         error: 'Amount must be greater than zero'
//       });
//     }

//     // Format phone number if needed
//     let formattedPhone = phoneNumber;
//     if (phoneNumber.startsWith('0')) {
//       formattedPhone = `254${phoneNumber.substring(1)}`;
//     } else if (phoneNumber.startsWith('+254')) {
//       formattedPhone = phoneNumber.substring(1);
//     }

//     if (!/^254\d{9}$/.test(formattedPhone)) {
//       return res.status(400).json({
//         error: 'Invalid phone number format. Use 07XX or 2547XX format'
//       });
//     }

//     // Generate timestamp and password
//     const timestamp = moment().format('YYYYMMDDHHmmss');
//     const businessShortCode = process.env.SHORTCODE;
//     const passKey = process.env.PASSKEY;
    
//     if (!businessShortCode || !passKey) {
//       return res.status(500).json({
//         error: 'Server configuration error. Please contact administrator.'
//       });
//     }

//     const password = Buffer.from(
//       `${businessShortCode}${passKey}${timestamp}`
//     ).toString('base64');

//     // Prepare request body
//     const requestBody = {
//       BusinessShortCode: businessShortCode,
//       Password: password,
//       Timestamp: timestamp,
//       TransactionType: 'CustomerPayBillOnline',
//       Amount: amount,
//       PartyA: formattedPhone,
//       PartyB: businessShortCode,
//       PhoneNumber: formattedPhone,
//       CallBackURL: `${process.env.CALLBACK_URL}/api/handleCallback`,
//       AccountReference: 'Restaurant Order',
//       TransactionDesc: 'Payment for food order'
//     };

//     // Send STK push request
//     const response = await axios.post(
//       `${process.env.BASE_URL}/mpesa/stkpush/v1/processrequest`,
//       requestBody,
//       {
//         headers: {
//           Authorization: `Bearer ${req.darajaToken}`,
//           'Content-Type': 'application/json'
//         },
//         timeout: 15000
//       }
//     );

//     // Check if STK push was successfully initiated
//     if (response.data.ResponseCode !== '0') {
//       return res.status(400).json({
//         error: 'Failed to initiate payment request',
//         responseDescription: response.data.ResponseDescription
//       });
//     }

//     // Save checkout request to database
//     const newCheckout = new CheckoutRequest({
//       checkoutRequestID: response.data.CheckoutRequestID,
//       merchantRequestID: response.data.MerchantRequestID,
//       phoneNumber: formattedPhone,
//       amount: amount
//     });

//     await newCheckout.save();

//     // Also create a transaction record
//     const newTransaction = new Transaction({
//       amount: amount,
//       checkoutId: response.data.CheckoutRequestID,
//       mpesaCode: 'Pending', // Will be updated by callback
//       phoneNumber: formattedPhone,
//       status: 'Pending'
//     });

//     await newTransaction.save();

//     // Poll for payment result (wait for callback to update the status)
//     const maxAttempts = 30; // Check for 30 * 2s = 60 seconds max
//     const delayMs = 2000; // Check every 2 seconds

//     for (let attempt = 0; attempt < maxAttempts; attempt++) {
//       // Wait before checking
//       await new Promise(resolve => setTimeout(resolve, delayMs));
      
//       // Check if the callback has updated the status
//       const updatedCheckout = await CheckoutRequest.findOne({
//         checkoutRequestID: response.data.CheckoutRequestID,
//         status: { $in: ['Completed', 'Failed', 'Timeout'] }
//       });

//       if (updatedCheckout) {
//         // Prepare response based on status
//         let statusCode = 200;
//         let responseData = {
//           message: 'Payment processed',
//           status: updatedCheckout.status,
//           checkoutRequestID: updatedCheckout.checkoutRequestID,
//           resultDescription: updatedCheckout.resultDescription
//         };

//         if (updatedCheckout.status === 'Completed') {
//           responseData.mpesaReceiptNumber = updatedCheckout.mpesaReceiptNumber;
//         } else if (updatedCheckout.status === 'Failed') {
//           statusCode = 400;
//         } else if (updatedCheckout.status === 'Timeout') {
//           statusCode = 408;
//         }

//         return res.status(statusCode).json(responseData);
//       }
//     }

//     // If we get here, polling timed out
//     await CheckoutRequest.findOneAndUpdate(
//       { checkoutRequestID: response.data.CheckoutRequestID },
//       { 
//         status: 'Timeout',
//         resultDescription: 'Payment processing timed out. Please check with your bank.'
//       }
//     );

//     await Transaction.findOneAndUpdate(
//       { checkoutId: response.data.CheckoutRequestID },
//       { status: 'Failed' }
//     );

//     res.status(408).json({
//       error: 'Payment processing timeout',
//       checkoutRequestID: response.data.CheckoutRequestID,
//       message: 'Please check with your bank or try again later.'
//     });

//   } catch (error) {
//     console.error('STK Push error:', error.message);
    
//     if (error.response) {
//       return res.status(error.response.status).json({
//         error: 'Payment request failed',
//         details: error.response.data
//       });
//     }
    
//     if (error.code === 'ECONNABORTED') {
//       return res.status(504).json({
//         error: 'Payment service timeout. Please try again.'
//       });
//     }
    
//     res.status(500).json({
//       error: 'An unexpected error occurred during payment processing',
//       details: error.message
//     });
//   }
// });

// // 2. Handle Callback from M-Pesa (Called by Safaricom)
// app.post('/api/handleCallback', async (req, res) => {
//   try {
//     console.log('M-Pesa callback received:', JSON.stringify(req.body, null, 2));
    
//     const callbackData = req.body;
    
//     // Validate callback structure
//     if (!callbackData.Body || !callbackData.Body.stkCallback) {
//       console.error('Invalid callback structure');
//       return res.status(400).json({
//         ResultCode: 1,
//         ResultDesc: 'Invalid callback structure'
//       });
//     }
    
//     const stkCallback = callbackData.Body.stkCallback;
//     const resultCode = stkCallback.ResultCode;
//     const merchantRequestID = stkCallback.MerchantRequestID;
//     const checkoutRequestID = stkCallback.CheckoutRequestID;
    
//     // Find the checkout request in database
//     const checkout = await CheckoutRequest.findOne({ 
//       $or: [
//         { checkoutRequestID: checkoutRequestID },
//         { merchantRequestID: merchantRequestID }
//       ]
//     });

//     if (!checkout) {
//       console.error('Checkout request not found:', checkoutRequestID);
//       return res.status(200).json({ 
//         ResultCode: 0, 
//         ResultDesc: 'Checkout request not found' 
//       });
//     }

//     // Update based on result code
//     if (resultCode !== 0) {
//       // Payment failed
//       await CheckoutRequest.findOneAndUpdate(
//         { checkoutRequestID: checkoutRequestID },
//         { 
//           status: 'Failed',
//           resultDescription: stkCallback.ResultDesc
//         }
//       );

//       await Transaction.findOneAndUpdate(
//         { checkoutId: checkoutRequestID },
//         { status: 'Failed' }
//       );
//     } else {
//       // Payment successful
//       const metadata = stkCallback.CallbackMetadata.Item;
      
//       const amountItem = metadata.find(item => item.Name === 'Amount');
//       const mpesaReceiptItem = metadata.find(item => item.Name === 'MpesaReceiptNumber');
//       const phoneItem = metadata.find(item => item.Name === 'PhoneNumber');
      
//       if (!amountItem || !mpesaReceiptItem || !phoneItem) {
//         console.error('Missing required metadata in callback');
//         return res.status(200).json({ 
//           ResultCode: 0, 
//           ResultDesc: 'Missing metadata' 
//         });
//       }

//       const amount = amountItem.Value;
//       const mpesaReceiptNumber = mpesaReceiptItem.Value;
//       const phoneNumber = phoneItem.Value;

//       // Update checkout request
//       await CheckoutRequest.findOneAndUpdate(
//         { checkoutRequestID: checkoutRequestID },
//         { 
//           status: 'Completed',
//           mpesaReceiptNumber: mpesaReceiptNumber,
//           resultDescription: 'Payment completed successfully'
//         }
//       );

//       // Update transaction
//       await Transaction.findOneAndUpdate(
//         { checkoutId: checkoutRequestID },
//         { 
//           mpesaCode: mpesaReceiptNumber,
//           status: 'Completed',
//           amount: amount,
//           phoneNumber: phoneNumber
//         }
//       );
//     }

//     // Always respond to Safaricom immediately
//     res.status(200).json({ 
//       ResultCode: 0, 
//       ResultDesc: 'Callback processed successfully' 
//     });

//   } catch (error) {
//     console.error('Error processing callback:', error);
//     res.status(200).json({ 
//       ResultCode: 0, 
//       ResultDesc: 'Callback processing error' 
//     });
//   }
// });

// // 3. Check payment status manually
// app.get('/api/check-status/:checkoutRequestID', async (req, res) => {
//   try {
//     const { checkoutRequestID } = req.params;
    
//     const checkout = await CheckoutRequest.findOne({ checkoutRequestID });
//     if (!checkout) {
//       return res.status(404).json({ error: 'Checkout request not found' });
//     }

//     const transaction = await Transaction.findOne({ checkoutId: checkoutRequestID });
    
//     res.json({
//       status: checkout.status,
//       mpesaReceiptNumber: checkout.mpesaReceiptNumber,
//       description: checkout.resultDescription,
//       amount: checkout.amount,
//       phoneNumber: checkout.phoneNumber,
//       transaction: transaction || {}
//     });
//   } catch (error) {
//     console.error('Status check error:', error);
//     res.status(500).json({ error: 'Failed to check status' });
//   }
// });

// // 4. Get all transactions (for admin purposes)
// app.get('/api/transactions', async (req, res) => {
//   try {
//     const { page = 1, limit = 10, status } = req.query;
//     const query = status ? { status } : {};
    
//     const transactions = await Transaction.find(query)
//       .sort({ createdAt: -1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit);
    
//     const count = await Transaction.countDocuments(query);
    
//     res.json({
//       transactions,
//       totalPages: Math.ceil(count / limit),
//       currentPage: page,
//       total: count
//     });
//   } catch (error) {
//     console.error('Get transactions error:', error);
//     res.status(500).json({ error: 'Failed to fetch transactions' });
//   }
// });

// // Health check endpoint
// app.get('/api/health', async (req, res) => {
//   try {
//     // Check database connection
//     await mongoose.connection.db.admin().ping();
    
//     res.json({
//       status: 'OK',
//       timestamp: new Date().toISOString(),
//       uptime: process.uptime(),
//       database: 'Connected'
//     });
//   } catch (error) {
//     res.status(500).json({
//       status: 'Error',
//       timestamp: new Date().toISOString(),
//       database: 'Disconnected',
//       error: error.message
//     });
//   }
// });

// // Database Connection and Server Startup
// mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/test', {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
//   serverSelectionTimeoutMS: 5000
// })
// .then(() => {
//   console.log('Connected to MongoDB successfully');
//   app.listen(port, () => {
//     console.log(`Server running on port ${port}`);
//     console.log(`STK Push endpoint: http://localhost:${port}/api/sendStkPush`);
//     console.log(`Callback endpoint: http://localhost:${port}/api/handleCallback`);
//     console.log(`Health check: http://localhost:${port}/api/health`);
//   });
// })
// .catch((error) => {
//   console.error('MongoDB connection error:', error);
//   process.exit(1);
// });

// // Graceful shutdown
// process.on('SIGINT', async () => {
//   console.log('Shutting down gracefully...');
//   await mongoose.connection.close();
//   console.log('MongoDB connection closed');
//   process.exit(0);
// });

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const moment = require('moment');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Enhanced Transaction Schema (Combines both previous collections)
const TransactionSchema = new mongoose.Schema({
  // Transaction Details
  amount: {
    type: Number,
    required: true,
    validate: {
      validator: function(v) {
        return v > 0;
      },
      message: props => `Amount must be greater than zero. Received: ${props.value}`
    }
  },
  checkoutRequestID: {
    type: String,
    required: true,
    unique: true
  },
  merchantRequestID: {
    type: String,
    required: true
  },
  mpesaReceiptNumber: {
    type: String,
    default: null
  },
  
  // Customer Information
  phoneNumber: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^254\d{9}$/.test(v);
      },
      message: props => `${props.value} is not a valid Kenyan phone number!`
    }
  },
  
  // Status Information
  status: {
    type: String,
    required: true,
    enum: ['Requested', 'Processing', 'Completed', 'Failed', 'Timeout'],
    default: 'Requested'
  },
  resultDescription: {
    type: String,
    default: null
  },
  
  // Timestamps
  requestedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better query performance
TransactionSchema.index({ checkoutRequestID: 1 });
TransactionSchema.index({ merchantRequestID: 1 });
TransactionSchema.index({ mpesaReceiptNumber: 1 });
TransactionSchema.index({ phoneNumber: 1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ createdAt: -1 });

// Virtual for formatted amount
TransactionSchema.virtual('formattedAmount').get(function() {
  return `KES ${(this.amount).toFixed(2)}`;
});

// Virtual for transaction age
TransactionSchema.virtual('ageInSeconds').get(function() {
  return Math.floor((new Date() - this.requestedAt) / 1000);
});

// Method to check if transaction is final
TransactionSchema.methods.isFinalStatus = function() {
  return ['Completed', 'Failed', 'Timeout'].includes(this.status);
};

const Transaction = mongoose.model('Transaction', TransactionSchema);

// Daraja Authentication Middleware
const darajaAuthMiddleware = async (req, res, next) => {
  try {
    const { CONSUMER_KEY, CONSUMER_SECRET, BASE_URL } = process.env;

    if (!CONSUMER_KEY || !CONSUMER_SECRET || !BASE_URL) {
      throw new Error('Missing required environment variables for Daraja authentication');
    }

    const encodedCredentials = Buffer.from(
      `${CONSUMER_KEY}:${CONSUMER_SECRET}`
    ).toString('base64');

    const response = await axios.get(
      `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${encodedCredentials}`
        },
        timeout: 10000
      }
    );

    if (!response.data || !response.data.access_token) {
      throw new Error('Failed to retrieve access token from Daraja API');
    }

    req.darajaToken = response.data.access_token;
    next();
  } catch (error) {
    console.error('Daraja authentication error:', error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data.errorMessage || 'Daraja API authentication error'
      });
    }
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        error: 'Daraja API timeout. Please try again.'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to authenticate with Daraja API',
      details: error.message
    });
  }
};

// API Endpoints

// 1. Send STK Push and wait for result
app.post('/api/sendStkPush', darajaAuthMiddleware, async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;

    // Validate input
    if (!phoneNumber || !amount) {
      return res.status(400).json({
        error: 'Phone number and amount are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be greater than zero'
      });
    }

    // Format phone number if needed
    let formattedPhone = phoneNumber;
    if (phoneNumber.startsWith('0')) {
      formattedPhone = `254${phoneNumber.substring(1)}`;
    } else if (phoneNumber.startsWith('+254')) {
      formattedPhone = phoneNumber.substring(1);
    }

    if (!/^254\d{9}$/.test(formattedPhone)) {
      return res.status(400).json({
        error: 'Invalid phone number format. Use 07XX or 2547XX format'
      });
    }

    // Generate timestamp and password
    const timestamp = moment().format('YYYYMMDDHHmmss');
    const businessShortCode = process.env.SHORTCODE;
    const passKey = process.env.PASSKEY;
    
    if (!businessShortCode || !passKey) {
      return res.status(500).json({
        error: 'Server configuration error. Please contact administrator.'
      });
    }

    const password = Buffer.from(
      `${businessShortCode}${passKey}${timestamp}`
    ).toString('base64');

    // Prepare request body
    const requestBody = {
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: businessShortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: `${process.env.CALLBACK_URL}/api/handleCallback`,
      AccountReference: 'Restaurant Order',
      TransactionDesc: 'Payment for food order'
    };

    // Send STK push request
    const response = await axios.post(
      `${process.env.BASE_URL}/mpesa/stkpush/v1/processrequest`,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${req.darajaToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    // Check if STK push was successfully initiated
    if (response.data.ResponseCode !== '0') {
      return res.status(400).json({
        error: 'Failed to initiate payment request',
        responseDescription: response.data.ResponseDescription
      });
    }

    // Create transaction record with all necessary information
    const newTransaction = new Transaction({
      amount: amount,
      checkoutRequestID: response.data.CheckoutRequestID,
      merchantRequestID: response.data.MerchantRequestID,
      phoneNumber: formattedPhone,
      status: 'Processing',
      resultDescription: 'Payment request initiated. Waiting for customer action.'
    });

    await newTransaction.save();

    // Poll for payment result (wait for callback to update the status)
    const maxAttempts = 30; // Check for 30 * 2s = 60 seconds max
    const delayMs = 2000; // Check every 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Wait before checking
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      // Check if the callback has updated the status
      const updatedTransaction = await Transaction.findOne({
        checkoutRequestID: response.data.CheckoutRequestID,
        status: { $in: ['Completed', 'Failed', 'Timeout'] }
      });

      if (updatedTransaction) {
        // Prepare response based on status
        let statusCode = 200;
        let responseData = {
          message: 'Payment processed',
          status: updatedTransaction.status,
          checkoutRequestID: updatedTransaction.checkoutRequestID,
          resultDescription: updatedTransaction.resultDescription
        };

        if (updatedTransaction.status === 'Completed') {
          responseData.mpesaReceiptNumber = updatedTransaction.mpesaReceiptNumber;
          responseData.completedAt = updatedTransaction.completedAt;
        } else if (updatedTransaction.status === 'Failed') {
          statusCode = 400;
        } else if (updatedTransaction.status === 'Timeout') {
          statusCode = 408;
        }

        return res.status(statusCode).json(responseData);
      }
    }

    // If we get here, polling timed out
    await Transaction.findOneAndUpdate(
      { checkoutRequestID: response.data.CheckoutRequestID },
      { 
        status: 'Timeout',
        resultDescription: 'Payment processing timed out. Please check with your bank.',
        completedAt: new Date()
      }
    );

    res.status(408).json({
      error: 'Payment processing timeout',
      checkoutRequestID: response.data.CheckoutRequestID,
      message: 'Please check with your bank or try again later.'
    });

  } catch (error) {
    console.error('STK Push error:', error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: 'Payment request failed',
        details: error.response.data
      });
    }
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        error: 'Payment service timeout. Please try again.'
      });
    }
    
    res.status(500).json({
      error: 'An unexpected error occurred during payment processing',
      details: error.message
    });
  }
});

// 2. Handle Callback from M-Pesa (Called by Safaricom)
app.post('/api/handleCallback', async (req, res) => {
  try {
    console.log('M-Pesa callback received:', JSON.stringify(req.body, null, 2));
    
    const callbackData = req.body;
    
    // Validate callback structure
    if (!callbackData.Body || !callbackData.Body.stkCallback) {
      console.error('Invalid callback structure');
      return res.status(400).json({
        ResultCode: 1,
        ResultDesc: 'Invalid callback structure'
      });
    }
    
    const stkCallback = callbackData.Body.stkCallback;
    const resultCode = stkCallback.ResultCode;
    const merchantRequestID = stkCallback.MerchantRequestID;
    const checkoutRequestID = stkCallback.CheckoutRequestID;
    
    // Find the transaction in database
    const transaction = await Transaction.findOne({ 
      $or: [
        { checkoutRequestID: checkoutRequestID },
        { merchantRequestID: merchantRequestID }
      ]
    });

    if (!transaction) {
      console.error('Transaction not found:', checkoutRequestID);
      return res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: 'Transaction not found' 
      });
    }

    // Update based on result code
    if (resultCode !== 0) {
      // Payment failed
      await Transaction.findOneAndUpdate(
        { checkoutRequestID: checkoutRequestID },
        { 
          status: 'Failed',
          resultDescription: stkCallback.ResultDesc || 'Payment failed',
          completedAt: new Date()
        }
      );
    } else {
      // Payment successful
      const metadata = stkCallback.CallbackMetadata.Item;
      
      const amountItem = metadata.find(item => item.Name === 'Amount');
      const mpesaReceiptItem = metadata.find(item => item.Name === 'MpesaReceiptNumber');
      const phoneItem = metadata.find(item => item.Name === 'PhoneNumber');
      
      if (!amountItem || !mpesaReceiptItem || !phoneItem) {
        console.error('Missing required metadata in callback');
        return res.status(200).json({ 
          ResultCode: 0, 
          ResultDesc: 'Missing metadata' 
        });
      }

      const amount = amountItem.Value;
      const mpesaReceiptNumber = mpesaReceiptItem.Value;
      const phoneNumber = phoneItem.Value;

      // Update transaction with complete details
      await Transaction.findOneAndUpdate(
        { checkoutRequestID: checkoutRequestID },
        { 
          status: 'Completed',
          mpesaReceiptNumber: mpesaReceiptNumber,
          resultDescription: 'Payment completed successfully',
          amount: amount,
          phoneNumber: phoneNumber,
          completedAt: new Date()
        }
      );
    }

    // Always respond to Safaricom immediately
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Callback processed successfully' 
    });

  } catch (error) {
    console.error('Error processing callback:', error);
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Callback processing error' 
    });
  }
});

// 3. Check payment status manually
app.get('/api/check-status/:checkoutRequestID', async (req, res) => {
  try {
    const { checkoutRequestID } = req.params;
    
    const transaction = await Transaction.findOne({ checkoutRequestID });
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({
      status: transaction.status,
      mpesaReceiptNumber: transaction.mpesaReceiptNumber,
      description: transaction.resultDescription,
      amount: transaction.amount,
      phoneNumber: transaction.phoneNumber,
      requestedAt: transaction.requestedAt,
      completedAt: transaction.completedAt,
      isFinal: transaction.isFinalStatus()
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// 4. Get all transactions (for admin purposes)
app.get('/api/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, phoneNumber } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (phoneNumber) query.phoneNumber = phoneNumber;
    
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const count = await Transaction.countDocuments(query);
    
    res.json({
      transactions,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// 5. Get transaction statistics
app.get('/api/transactions/stats', async (req, res) => {
  try {
    const totalTransactions = await Transaction.countDocuments();
    const completedTransactions = await Transaction.countDocuments({ status: 'Completed' });
    const failedTransactions = await Transaction.countDocuments({ status: 'Failed' });
    const pendingTransactions = await Transaction.countDocuments({ status: 'Processing' });
    
    const totalAmount = await Transaction.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    res.json({
      totalTransactions,
      completedTransactions,
      failedTransactions,
      pendingTransactions,
      totalAmount: totalAmount[0]?.total || 0
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    await mongoose.connection.db.admin().ping();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'Connected',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error',
      timestamp: new Date().toISOString(),
      database: 'Disconnected',
      error: error.message
    });
  }
});

// Database Connection and Server Startup
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/app', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => {
  console.log('Connected to MongoDB successfully');
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`STK Push endpoint: http://localhost:${port}/api/sendStkPush`);
    console.log(`Callback endpoint: http://localhost:${port}/api/handleCallback`);
    console.log(`Health check: http://localhost:${port}/api/health`);
  });
})
.catch((error) => {
  console.error('MongoDB connection error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});