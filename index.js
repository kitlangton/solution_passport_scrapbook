const express = require("express");
const app = express();
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const expressSession = require("express-session");
const mongoose = require("mongoose");
const flash = require("express-flash");
const User = require("./models/User");
const FB = require("fb");
const Twitter = require("twitter");
mongoose.connect("mongodb://localhost/passporter");
mongoose.promise = Promise;

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(flash());
app.use(
  expressSession({
    secret: "keyboard cat",
    saveUninitialized: false,
    resave: false
  })
);
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LocalStrategy(function(username, password, done) {
    User.findOne({ username }, function(err, user) {
      if (err) return done(err);
      if (!user || !user.validPassword(password)) {
        return done(null, false, { message: "Incorrect username." });
      }
      return done(null, user);
    });
  })
);

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

// facebook
const FacebookStrategy = require("passport-facebook").Strategy;

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: "http://localhost:4000/auth/facebook/callback",
      passReqToCallback: true
    },
    function(req, accessToken, refreshToken, profile, done) {
      const facebookId = profile.id;
      if (req.user) {
        req.user.facebookId = facebookId;
        req.user.facebookToken = accessToken;
        req.user.save((err, user) => {
          if (err) return done(err);
          done(null, user);
        });
        return;
      }
      User.findOne({ facebookId }, function(err, user) {
        if (err) return done(err);
        if (!user) {
          user = new User({
            facebookId,
            username: profile.displayName,
            facebookToken: accessToken
          });
          user.save((err, user) => {
            if (err) return done(err);
            done(null, user);
          });
        } else {
          done(null, user);
        }
      });
    }
  )
);

app.get(
  "/auth/facebook",
  passport.authenticate("facebook", { scope: ["user_friends", "user_photos"] })
);

app.get(
  "/auth/facebook/callback",
  passport.authenticate("facebook", {
    successRedirect: "/",
    failureRedirect: "/login"
  })
);

const TwitterStrategy = require("passport-twitter").Strategy;
passport.use(
  new TwitterStrategy(
    {
      consumerKey: process.env.TWITTER_KEY,
      consumerSecret: process.env.TWITTER_SECRET,
      callbackURL: "http://localhost:4000/auth/twitter/callback",
      passReqToCallback: true
    },
    function(req, token, tokenSecret, profile, cb) {
      const user = req.user;
      if (user) {
        user.twitterId = profile.id;
        user.twitterToken = token;
        user.twitterSecret = tokenSecret;
        user.save((err, user) => {
          if (err) return cb(err);
          cb(null, user);
        });
      } else {
        cb(null, false);
      }
    }
  )
);

app.get("/auth/twitter", passport.authenticate("twitter"));

app.get(
  "/auth/twitter/callback",
  passport.authenticate("twitter", {
    successRedirect: "/",
    failureRedirect: "/login"
  })
);

app.set("view engine", "hbs");

function getPhotos(user, count = 10) {
  return new Promise(resolve => {
    FB.api(
      "me/photos",
      { fields: "images", access_token: user.facebookToken },
      function(res) {
        const images = res.data.map(photo => photo.images[0].source);
        resolve(images.reverse().slice(10, 10 + count));
      }
    );
  });
}

function getTweets(user, count = 5) {
  console.log(user);
  var client = new Twitter({
    consumer_key: process.env.TWITTER_KEY,
    consumer_secret: process.env.TWITTER_SECRET,
    access_token_key: user.twitterToken,
    access_token_secret: user.twitterSecret
  });
  return new Promise(resolve => {
    client.get("favorites/list", function(error, tweets, response) {
      if (error) return console.log(error);
      resolve(tweets.slice(0, count));
    });
  });
}

app.get("/", async (req, res) => {
  const user = req.user;
  if (user) {
    let facebookPhotos = [];
    let tweets = [];
    if (user.facebookToken) {
      facebookPhotos = await getPhotos(user);
    }
    if (user.twitterToken && user.twitterSecret) {
      tweets = await getTweets(user);
    }
    res.render("home", { user, facebookPhotos, tweets });
  } else {
    res.redirect("/login");
  }
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/register", (req, res) => {
  res.render("register");
});

app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

app.post("/profile", (req, res) => {
  const { password, username } = req.body;
  const user = req.user;
  console.log(user);
  if (password) user.password = password;
  if (username) user.username = username;
  user.save((err, user) => {
    if (err) {
      console.log(err);
      req.flash("warning", "fail");
      res.redirect("back");
    } else {
      req.flash("warning", "success");
      res.redirect("back");
    }
  });
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true
  })
);

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true
  })
);

app.post("/register", (req, res, next) => {
  const { username, password } = req.body;
  console.log(req.body);
  const user = new User({ username, password });
  user.save((err, user) => {
    console.log(err, user);
    req.login(user, function(err) {
      if (err) {
        return next(err);
      }
      return res.redirect("/");
    });
  });
});

app.listen(4000);
