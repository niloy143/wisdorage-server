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

        app.get('/users', verifyUser, verifyAdmin, async (req, res) => {
            const users = await usersCollection.find({ role: req.query.role }).toArray();
            res.send(users);
        })

        app.post('/user', async (req, res) => {
            const user = await usersCollection.findOne({ email: req.body.email });
            !user && await usersCollection.insertOne(req.body);
            res.send({ message: 'User Added' });
        })

        app.get('/user', verifyUser, async (req, res) => {
            const user = await usersCollection.findOne({ email: req.query.email });
            res.send({ role: user?.role });
        })

        app.delete('/user/:email', verifyUser, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const userResult = await usersCollection.updateOne({ email }, { $set: { deleted: true } }, { upsert: true });
            const orderedByResult = await booksCollection.updateMany({ orderedBy: email }, { $unset: { orderedBy: "" } });
            const booksResult = await booksCollection.deleteMany({ sellerEmail: email });
            const ordersResult = await ordersCollection.deleteMany({ buyerEmail: email });

            res.send({ done: userResult.acknowledged && orderedByResult.acknowledged && booksResult.acknowledged && ordersResult.acknowledged });
        })

        app.get('/is-deleted/:user', async (req, res) => {
            const user = await usersCollection.findOne({ email: req.params.user });
            res.send({ isDeleted: !!(user?.deleted) })
        })

        app.put('/user/verify/:user', verifyUser, verifyAdmin, async (req, res) => {
            const bookResult = await booksCollection.updateMany({ sellerEmail: req.params.user }, { $set: { verifiedSeller: true } }, { upsert: true });
            const userResult = await usersCollection.updateOne({ email: req.params.user }, { $set: { verified: true } }, { upsert: true });
            if (bookResult.acknowledged && userResult.modifiedCount === 1) {
                return res.send({ verified: true })
            }
            res.send({ verified: false })
        })

        app.put('/user/cancel-verified/:user', verifyUser, verifyAdmin, async (req, res) => {
            const bookResult = await booksCollection.updateMany({ sellerEmail: req.params.user }, { $unset: { verifiedSeller: true } }, { upsert: true });
            const userResult = await usersCollection.updateOne({ email: req.params.user }, { $unset: { verified: true } }, { upsert: true });
            if (bookResult.acknowledged && userResult.modifiedCount === 1) {
                return res.send({ cancelled: true })
            }
            res.send({ cancelled: false })
        })

        app.get('/categories', async (req, res) => {
            const categories = await categoriesCollection.find({}).toArray();
            res.send(categories);
        })

        app.get('/books/:category', verifyUser, async (req, res) => {
            const books = await booksCollection.find({ categoryId: req.params.category }).toArray();
            res.send(books);
        })

        app.get('/my-books', verifyUser, verifySeller, async (req, res) => {
            const books = await booksCollection.find({ sellerEmail: req.query.email }).sort({ postedIn: -1 }).toArray();
            res.send(books);
        })

        app.get('/ad/books', async (req, res) => {
            const books = await booksCollection.find({ advertised: true }).toArray();
            res.send(books);
        })

        app.put('/ad/book/:id', verifyUser, verifySeller, async (req, res) => {
            const result = await booksCollection.updateOne({ _id: ObjectId(req.params.id) }, { $set: { advertised: true } });
            res.send(result);
        })

        app.post('/book', verifyUser, verifySeller, async (req, res) => {
            const result = await booksCollection.insertOne(req.body);
            res.send(result);
        })

        app.put('/edit/book/:id', verifyUser, verifySeller, async (req, res) => {
            const { _id, resalePrice, available, location } = req.body;
            const result = await booksCollection.updateOne(
                { _id: ObjectId(_id) },
                {
                    $set: {
                        resalePrice,
                        available,
                        location
                    }
                }
            )
            res.send(result)
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