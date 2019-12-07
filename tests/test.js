// TODO: mocha

const express = require("express")
const mongoose = require("mongoose")
const herpestes = require("./herpestes")

const server = express()
server.use(express.json());
server.use(express.urlencoded({ extended: true }));
mongoose.connect('mongodb://localhost:27017/herpestes_test_db')


// Create a model
const TestSchema = new mongoose.Schema({a: {type: String}, b: {type: String}});
TestSchema.set("timestamps", true);
TestModel = mongoose.model("Test", TestSchema);

// Create CRUD router
const testCrud = herpestes.crud({
    model: 'Test',
    attach: server
})

// Run server
server.get("*", (req, res) => res.send("retard"))
server.listen(cfg.port, (err) => {
    if (err) { throw err }
    console.log(`> Ready on ${cfg.host}:${cfg.port}`)
})
