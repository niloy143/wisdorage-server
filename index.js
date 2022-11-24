require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 1234;
const jwtSecret = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send({ status: 'running' })
})

app.get('/jwt', (req, res) => {
    const token = jwt.sign({ email: req.query.email }, jwtSecret, { expiresIn: '7d' });
    res.send({ token });
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.sq5icdb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        const usersCollection = client.db('wisdorage').collection('users');

        app.post('/users', async (req, res) => {
            const user = await usersCollection.findOne({ email: req.body.email });
            !user && await usersCollection.insertOne(req.body);
        })

        app.get('/user/:email', async (req, res) => {
            const user = await usersCollection.findOne({ email: req.params.email });
            res.send({ role: user.role })
        })
    }
    catch (err) {
        console.log(err)
    }
}

run().catch(err => console.log(err))

app.listen(port, () => {
    console.log(`Wisdorage server is running on ${port}`)
})