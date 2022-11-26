require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 1234;
const jwtSecret = process.env.JWT_SECRET;

const verifyUser = (req, res, next) => {
    const authToken = req.headers?.authorization;
    if (!authToken) {
        return res.status(401).send({ access: 'denied' });
    }
    const token = authToken.split(' ')[1];
    jwt.verify(token, jwtSecret, (err, decoded) => {
        if (err) {
            return res.status(401).send({ access: 'denied' });
        }
        else if (decoded.email !== req.query.email) {
            return res.status(403).send({ access: 'forbidden' });
        }
        next();
    })
}

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
        const categoriesCollection = client.db('wisdorage').collection('categories');
        const booksCollection = client.db('wisdorage').collection('books');
        const ordersCollection = client.db('wisdorage').collection('orders');

        const verifyBuyer = async (req, res, next) => {
            const user = await usersCollection.findOne({ email: req.query.email });
            if (user.role !== 'buyer') {
                return res.status(403).send({ access: 'forbidden' });
            }
            next();
        }
        const verifySeller = async (req, res, next) => {
            const user = await usersCollection.findOne({ email: req.query.email });
            if (user.role !== 'seller') {
                return res.status(403).send({ access: 'forbidden' });
            }
            next();
        }
        const verifyAdmin = async (req, res, next) => {
            const user = await usersCollection.findOne({ email: req.query.email });
            if (user.role !== 'admin') {
                return res.status(403).send({ access: 'forbidden' });
            }
            next();
        }

        app.post('/user', async (req, res) => {
            const user = await usersCollection.findOne({ email: req.body.email });
            !user && await usersCollection.insertOne(req.body);
        })

        app.get('/user', verifyUser, async (req, res) => {
            const user = await usersCollection.findOne({ email: req.query.email });
            res.send({ role: user?.role });
        })

        app.get('/sellers', verifyUser, verifyAdmin, async (req, res) => {
            const sellers = await usersCollection.find({ role: 'seller' }).toArray();
            res.send(sellers);
        })

        app.get('/buyers', verifyUser, verifyAdmin, async (req, res) => {
            const buyers = await usersCollection.find({ role: 'buyer' }).toArray();
            res.send(buyers);
        })

        app.get('/categories', async (req, res) => {
            const categories = await categoriesCollection.find({}).toArray();
            res.send(categories);
        })

        app.get('/books/:category', verifyUser, async (req, res) => {
            const books = await booksCollection.find({ categoryId: req.params.category }).toArray();
            res.send(books);
        })

        app.get('/ad/books', async (req, res) => {
            const books = await booksCollection.find({ advertised: true }).toArray();
            res.send(books);
        })

        app.post('/book', async (req, res) => {
            const result = await booksCollection.insertOne(req.body);
            res.send(result);
        })

        app.get('/orders', verifyUser, async (req, res) => {
            const orders = await ordersCollection.find({ buyerEmail: req.query.email }).sort({ orderDate: -1 }).toArray();
            res.send(orders);
        })

        app.post('/order', verifyUser, async (req, res) => {
            const orderResult = await ordersCollection.insertOne(req.body);
            await booksCollection.updateOne({ _id: ObjectId(req.body.bookId) }, { $set: { orderedBy: req.body.buyerEmail } }, { upsert: true });
            res.send(orderResult);
        })

        app.delete('/order/:bookId', verifyUser, async (req, res) => {
            await booksCollection.updateOne({ _id: ObjectId(req.params.bookId) }, { $unset: { orderedBy: "" } });
            const result = await ordersCollection.deleteOne({ bookId: req.params.bookId });
            res.send(result);
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