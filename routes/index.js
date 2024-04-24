const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/userSchema'); 
const Message = require('../models/messageSchema'); 

router.get('/', async (req, res) => {
  const messages = await Message.find().populate('user');;
  res.render('index', { user: req.user, message: messages });
});

router.get('/login', (req, res) => {
res.render('login', {user: req.user, })
})

router.post('/login', 
  body('username').notEmpty().withMessage('Username must not be empty.'),
  body('password').notEmpty().withMessage('Password must not be empty.'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render('login', { user: req.user, errors: errors.array() });
    }
    passport.authenticate('local', (err, user, info) => {
      if (err) { return next(err); }
      if (!user) { return res.status(400).render('login', { user: req.user, message: info.message }); }
      req.logIn(user, (err) => {
        if (err) { return next(err); }
        return res.redirect('/');
      });
    })(req, res, next);
  }
);

router.get('/signup', (req, res) => {
res.render('signup', {user: req.user, })
})

router.post('/signup', 
  body('username').notEmpty().withMessage('Username must not be empty.'),
  body('password').notEmpty().withMessage('Password must not be empty.'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render('signup' , {user: req.user, errors: errors.array() });
    }
    const user = await User.findOne({ username: req.body.username });
    if (user) {
      return res.status(400).render('signup', { message: 'Username already exists.' });
    }
    bcrypt.hash(req.body.password, 10, async (err, hashedPassword) => {
      if (err) { return next(err); }
      const newUser = new User({
        username: req.body.username,
        password: hashedPassword,
      });
      await newUser.save();
      req.logIn(newUser, (err) => {
        if (err) { return next(err); }
        return res.redirect('/');
      });
    });
  }
);

router.get('/new-message', (req,res) => {
  res.render('new-message', { user: req.user });
})

router.post('/new-message', 
  body('title').notEmpty().withMessage('Title must not be empty.'),
  body('message').notEmpty().withMessage('message must not be empty.'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render('new-message', { user: req.user, errors: errors.array() });
    }
    try {
      const message = new Message({
        title: req.body.title,
        message: req.body.message,
        user: req.user._id,
        timestamp: Date.now()
      });
      await message.save();
      res.redirect('/');
    } catch(err) {
      next(err);
    }
  }
);

router.get('/logout', (req, res) => {
  req.logout(() => {});
  res.redirect('/');
});

module.exports = router;