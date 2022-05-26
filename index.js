const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;
const app = express();
// require('crypto').randomBytes(64).toString('hex')

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7aeyp.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "unAuthorized" });
  } else {
    const token = authorization.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
      console.log(err);
      if (err) {
        return res.status(402).send({ message: "Token has Expired" });
      }
      req.decoded = decoded.email;
    });
  }
  next();
};

async function run() {
  try {
    await client.connect();

    const servicesCollection = client
      .db("doctorsPortalDB")
      .collection("Services");

    const appointmentCollection = client
      .db("doctorsPortalDB")
      .collection("userAppointment");

    const userCollection = client.db("doctorsPortalDB").collection("users");

    //get all Service
    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/appointment", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const patientEmail = req.decoded;
      if (email === patientEmail) {
        const query = { patientEmail: email };
        const booking = await appointmentCollection.find(query).toArray();
        return res.send(booking);
      }
    });

    // user update
    app.put("/user/admin/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });

    // user update
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });

    // get all user
    app.get("/users", verifyJWT, async (req, res) => {
      res.send(await userCollection.find().toArray());
    });

    // submit treatment slot by user
    app.post("/setAppointment", async (req, res) => {
      const bookingDetails = req.body;
      const query = {
        patientName: bookingDetails.patientName,
        date: bookingDetails.date,
      };
      const exist = await appointmentCollection.findOne(query);
      if (exist) {
        return res.send({
          success: false,
          bookingDetails: exist,
          message: "Already have an appointment and appointment on",
        });
      } else {
        const result = await appointmentCollection.insertOne(bookingDetails);
        res.send({
          success: true,
          message: "Appointment is set",
        });
      }
    });

    //this is not a proper way to query
    //after learning more about mongodb, use aggregate lookup, pipeline, match, group
    // available services
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      // step-1
      const services = await servicesCollection.find().toArray();

      //step-2 : get all booking a day
      const query = { date: date };
      const booking = await appointmentCollection.find(query).toArray();
      // res.send(booking);

      services.forEach((service) => {
        const serviceBooking = booking.filter((b) => {
          b.ServiceSelected === service.serviceName;
        });
        // res.send(serviceBooking);
        const bookedSlots = serviceBooking.map((book) => book.slot);

        const available = service.slot.filter(
          (slot) => !bookedSlots.includes(slot)
        );

        service.slot = available;
      });
    });
  } finally {
    //   client.close()
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log("Listening form port ", port);
});
