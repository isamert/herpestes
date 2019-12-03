const express = require("express")
const mongoose = require("mongoose")
const herpestes = require("./herpestes")
const server = express()
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

cfg = {}
cfg.port = 8000
cfg.host = "localhost"

cfg.db = {}
cfg.db.host = "localhost"
cfg.db.port = 27017
cfg.db.name = "cruddb"

// Connect to database
mongoose.connect(`mongodb://${cfg.db.host}:${cfg.db.port}/${cfg.db.name}`)


// Create a model
const TestSchema = new mongoose.Schema({
    a: {type: String},
    b: {type: String}
});
TestSchema.set("timestamps", true);
TestModel = mongoose.model("Test", TestSchema);

// Create CRUD router
const testCrudRouter = new express.Router();
const testCrud = herpestes.crud({
    model: "Test"
})
testCrudRouter.use("/:id", testCrud.findById())
testCrudRouter.route("/")
    .get(testCrud.all())
    .post(testCrud.post())

testCrudRouter.route("/:id")
    .get(testCrud.get())
    .put(testCrud.put())
    .patch(testCrud.patch())
    .delete(testCrud.delete())

server.use("/tests", testCrudRouter)

// Run server
server.get("*", (req, res) => res.send("retard"))
server.listen(cfg.port, (err) => {
    if (err) { throw err }
    console.log(`> Ready on ${cfg.host}:${cfg.port}`)
})
