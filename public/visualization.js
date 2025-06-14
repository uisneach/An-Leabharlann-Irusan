// Neo4j HTTP endpoint for Cypher transaction API
const neo4j_http_url = "http://localhost:7474/db/neo4j/tx"
const neo4jUsername = "neo4j"
const neo4jPassword = "neo4j123"

// used for drawing nodes and arrows later on
const circleSize = 30
const arrowHeight = 5
const arrowWidth = 5

const submitQuery = () => {
    // Create new, empty objects to hold the nodes and relationships returned by the query results
    let nodeItemMap = {}
    let linkItemMap = {}

    // contents of the query text field
    const cypherString = document.querySelector('#queryContainer').value

    // make POST request with auth headers
    let response = fetch(neo4j_http_url, {
        method: 'POST',
        // authentication using the username and password of the user in Neo4j
        headers: {
            "Authorization": "Basic " + btoa(`${neo4jUsername}:${neo4jPassword}`),
            "Content-Type": "application/json",
            "Accept": "application/json;charset=UTF-8",
        },
        // Formatted request for Neo4j's Cypher Transaction API with generated query included
        // https://neo4j.com/docs/http-api/current/actions/query-format/
        // generated query is formatted to be valid JSON for insertion into request body
        body: '{"statements":[{"statement":"' + cypherString.replace(/(\r\n|\n|\r)/gm, "\\n").replace(/"/g, '\\"') + '", "resultDataContents":["graph", "row"]}]}'
    })
        .then(res => res.json())
        .then(data => { // usable data from response JSON

            // if errors present in the response from Neo4j, propagate alert() dialog box with the error
            if (data.errors != null && data.errors.length > 0) {
                alert(`Error:${data.errors[0].message}(${data.errors[0].code})`);
            }

            // if results within valid data are not null or empty, extract the returned nodes/relationships into nodeItemMap and linkItemMap respectively
            if (data.results != null && data.results.length > 0 && data.results[0].data != null && data.results[0].data.length > 0) {
                let neo4jDataItmArray = data.results[0].data;
                neo4jDataItmArray.forEach(function (dataItem) { // iterate through all items in the embedded 'results' element returned from Neo4j, https://neo4j.com/docs/http-api/current/actions/result-format/
                    //Node
                    if (dataItem.graph.nodes != null && dataItem.graph.nodes.length > 0) {
                        let neo4jNodeItmArray = dataItem.graph.nodes; // all nodes present in the results item
                        neo4jNodeItmArray.forEach(function (nodeItm) {
                            if (!(nodeItm.id in nodeItemMap)) // if node is not yet present, create new entry in nodeItemMap whose key is the node ID and value is the node itself
                                nodeItemMap[nodeItm.id] = nodeItm;
                        });
                    }
                    //Link, interchangeably called a relationship
                    if (dataItem.graph.relationships != null && dataItem.graph.relationships.length > 0) {
                        let neo4jLinkItmArray = dataItem.graph.relationships; // all relationships present in the results item
                        neo4jLinkItmArray.forEach(function (linkItm) {
                            if (!(linkItm.id in linkItemMap)) { // if link is not yet present, create new entry in linkItemMap whose key is the link ID and value is the link itself
                                // D3 force layout graph uses 'startNode' and 'endNode' to determine link start/end points, these are called 'source' and 'target' in JSON results from Neo4j
                                linkItm.source = linkItm.startNode;
                                linkItm.target = linkItm.endNode;
                                linkItemMap[linkItm.id] = linkItm;
                            }
                        });
                    }
                });
            }

            // update the D3 force layout graph with the properly formatted lists of nodes and links from Neo4j
            updateGraph(Object.values(nodeItemMap), Object.values(linkItemMap));
        });
}

// create a new D3 force simulation with the nodes and links returned from a query to Neo4j for display on the canvas element
const updateGraph = (nodes, links) => {
    const canvas = document.querySelector('canvas');
    const width = canvas.width;
    const height = canvas.height;

    let transform = d3.zoomIdentity;

    // This object sets the force between links and instructs the below simulation to use the links provided from query results, https://github.com/d3/d3-force#links
    const d3LinkForce = d3.forceLink()
        .distance(50)
        .strength(0.1)
        .links(links)
        .id((d) => {
            return d.id;
        });

    /*
    This defines a new D3 Force Simulation which controls the physical behavior of how nodes and links interact.
    https://github.com/d3/d3-force#simulation
    */
    let simulation = new d3.forceSimulation()
        .force('chargeForce', d3.forceManyBody().strength())
        .force('collideForce', d3.forceCollide(circleSize * 3))

    // Here, the simulation is instructed to use the nodes returned from the query results and to render links using the force defined above
    simulation
        .nodes(nodes)
        .force("linkForce", d3LinkForce)
        .on("tick",simulationUpdate) // on each tick of the simulation's internal timer, call simulationUpdate()
        .restart();

    d3.select(canvas)
        .call(d3.zoom()
            .scaleExtent([0.05, 10])
            .on('zoom', zoomed));

    function zoomed(e) {
        transform = e.transform;
        simulationUpdate();
    }

    //The canvas is cleared and then instructed to draw each node and link with updated locations per the physical force simulation.
    function simulationUpdate() {
        let context = canvas.getContext('2d');
        context.save(); // save canvas state, only rerender what's needed
        context.clearRect(0, 0, width, height);
        context.translate(transform.x, transform.y);
        context.scale(transform.k, transform.k);

        // Draw links
        links.forEach(function(d) {
            context.beginPath();
            const deltaX = d.target.x - d.source.x;
            const deltaY = d.target.y - d.source.y;
            const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const cosTheta = deltaX / dist;
            const sinTheta = deltaY / dist;
            const sourceX = d.source.x + (circleSize * cosTheta);
            const sourceY = d.source.y + (circleSize * sinTheta);
            const targetX = d.target.x - (circleSize * cosTheta);
            const targetY = d.target.y - (circleSize * sinTheta);

            const arrowLeftX = targetX - (arrowHeight * sinTheta) - (arrowWidth * cosTheta);
            const arrowLeftY = targetY + (arrowHeight * cosTheta) - (arrowWidth * sinTheta);
            const arrowRightX = targetX + (arrowHeight * sinTheta) - (arrowWidth * cosTheta);
            const arrowRightY = targetY - (arrowHeight * cosTheta) - (arrowWidth * sinTheta);

            // Each link is drawn using SVG-format data to easily draw the dynamically generated arc
            let path = new Path2D(`M${sourceX},${sourceY} ${targetX},${targetY} M${targetX},${targetY} L${arrowLeftX},${arrowLeftY} L${arrowRightX},${arrowRightY} Z`);

            context.closePath();
            context.stroke(path);
        });

        // Draw nodes
        nodes.forEach(function(d) {
            context.beginPath();
            context.arc(d.x, d.y, circleSize, 0, 2 * Math.PI);

            // fill color
            context.fillStyle = '#6df1a9';
            context.fill()

            context.textAlign = "center"
            context.textBaseline = "middle"

            // Draws the appropriate text on the node
            context.strokeText(d.properties.name || d.properties.title, d.x, d.y)
            context.closePath();
            context.stroke();
        });
        context.restore();
    }
}
function responsiveCanvasSizer() {
    const canvas = document.querySelector('canvas')
    const rect = canvas.getBoundingClientRect()
    // ratio of the resolution in physical pixels to the resolution in CSS pixels
    const dpr = window.devicePixelRatio

    // Set the "actual" size of the canvas
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    // Set the "drawn" size of the canvas
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
}

