// TODO: mocha

const express = require("express")
const mongoose = require("mongoose")
const herpestes = require("../index")

const server = express()
server.use(express.json());
server.use(express.urlencoded({ extended: true }));
mongoose.connect('mongodb://localhost:27017/herpestes_test_db')


// Create a model
const ChildSchema = new mongoose.Schema({
    d: String,
    e: Number
})
const ChildModel = mongoose.model("Child", ChildSchema)
const TestSchema = new mongoose.Schema({
    a: String,
    b: String,
    c: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Child"
    }]
})
TestSchema.set("timestamps", true);
const TestModel = mongoose.model("Test", TestSchema);

(async () => {
    const child = await ChildModel.create({d: "6", e: 7})
    const child2 = await ChildModel.create({d: "1", e: 2})
    TestModel.create({a: "1", b: "2", c: [child._id, child2._id]});
    TestModel.create({a: "2", b: "3", c: [child._id]});
    TestModel.create({a: "3", b: "4", c: []});
    TestModel.create({a: "5", b: "5", c: []});
})

// Create CRUD router
const testCrud = herpestes.crud({
    model: 'Test',
    attach: server
}).router()

// Run server
server.get("*", (req, res) => res.send("retard"))
server.listen(8001, (err) => {
    if (err) { throw err }
    console.log(`> Ready on localhost:8001`)
})
