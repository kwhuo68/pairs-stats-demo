import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import ReactFC from "react-fusioncharts";
import FusionCharts from "fusioncharts";
import Column2D from "fusioncharts/fusioncharts.charts";
import FusionTheme from "fusioncharts/themes/fusioncharts.theme.fusion";
import Papa from 'papaparse';
import {
  Button,
  Card,
  Container,
  Form,
  Row,
  Col,
} from 'react-bootstrap';

ReactFC.fcRoot(FusionCharts, Column2D, FusionTheme);

function App() {
  const [rows, setRows] = useState([]);
  const [impermanentLoss, setImpermanentLoss] = useState(0);
  const [flowReturn, setFlowReturn] = useState(0);
  const [lpReturn, setLpReturn] = useState(0);
  const [showChart, setShowChart] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [chartConfigs, setChartConfigs] = useState({});
  useEffect(() => {
    async function getData() {
      const resp = await fetch('/data/sample_combined.csv');
      const reader = resp.body.getReader();
      const res = await reader.read();
      const decoder = new TextDecoder('utf-8');
      const csv = decoder.decode(res.value);
      const res_obj = Papa.parse(csv, {header: true});
      setRows(res_obj.data); 
    }
    getData();
  }, []);

  const currencyDecimalMapping = {
    'ETH': 18,
    'RLY': 18,
    'ROOK': 18,
    'BOND': 18,
    'USDC': 6,
    'mAMZN': 18,
    'UST': 18,
    'mGOOGLE': 18,
    'AAVE': 18,
    'MKR': 18,
    'UNI': 18,
    'renBTC': 8
  }

  /* Calc impermanent loss given price ratios */
  const calcImpermanentLoss = (beginPriceRatio, endPriceRatio) => {
    const priceRatio = endPriceRatio/beginPriceRatio;
    const impermanentLoss = 2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1;
    return impermanentLoss
  }

  /* Calc rets - impermanent loss + flow return, ex: ETH-RLY, 12888158, 12916157, 1 */
  const calcLpReturns = (pair, begin, end, size, 
    customBegin=null, customEnd=null, 
    customFlow=null, customFlowPeriods=null) => {
    const beginRow = rows.filter(row => (row.pair === pair && row.timestamp === begin));
    const endRow = rows.filter(row => (row.pair === pair && row.timestamp_end === end));
    
    //Tokens and decimals
    const token1 = pair.split("-")[0];
    const token2 = pair.split("-")[1];
    const token1dec = currencyDecimalMapping[token1];
    const token2dec = currencyDecimalMapping[token2];
    const token1size = parseFloat(size) * (10**token1dec) * 0.5;
    const token2size = parseFloat(size) * (10**token2dec) * 0.5;

    //Pairs
    const beginPair1 = parseFloat(beginRow[0].pair1);
    const beginPair2 = parseFloat(beginRow[0].pair2);
    const endPair1 = parseFloat(endRow[0].pair1);
    const endPair2 = parseFloat(endRow[0].pair2);

    //Price ratios and impermanent loss
    var beginPriceRatio = (beginPair2 + token2size)/+(beginPair1 + token1size);
    if (customBegin) {
      beginPriceRatio = parseFloat(customBegin);
    }
    var endPriceRatio = (endPair2 + token2size)/(endPair1 + token1size);
    if (customEnd) {
      endPriceRatio = parseFloat(customEnd);
    }

    const impermanentLoss = calcImpermanentLoss(beginPriceRatio, endPriceRatio);

    if (!customBegin && !customEnd) {
      setImpermanentLoss(impermanentLoss);
    } 

    //Flow
    const endTk1out = parseFloat(endRow[0].tk1out);
    const beginTk1in = parseFloat(beginRow[0].tk1in);
    var flowReturn = (Math.abs(endTk1out - beginTk1in) + token1size) * 0.003 / (endPair1 + token1size);
    if (customFlow && customFlowPeriods) {
      flowReturn = customFlow * customFlowPeriods;
    }

    if (!customFlow && !customFlowPeriods) {
      setFlowReturn(flowReturn);
    }

    //Total
    const lpReturn = impermanentLoss + flowReturn;
    if (!customBegin && !customEnd && !customFlow && !customFlowPeriods) {
      setLpReturn(lpReturn);
    } 

    return lpReturn;
  };

  /* Make range of values */
  const makeRange = (start, stop, size) => {
    var arr = [];
    var step = (stop - start) / (size-1);
    for (var i = 0; i < size; i++) {
      arr.push(start + (step * i));
    }
    return arr;
  }

  /* Calc Expected returns given entry price, size, flow, position time */
  const calcExpectedReturns = (pair, begin, end, eprice, size, flow, posTime) => {
    const range = makeRange(eprice/5.0, eprice*5, 20);

    //Populate chart data
    var chartData = [];
    for (var i = 0; i < range.length; i++) {
      const ret = calcLpReturns(pair, begin, end, size, eprice, range[i], flow, posTime);
      chartData.push({label: parseInt(range[i]).toString(), value: ret});
    }

    const chartConfigs = {
      type: "line",
      width: "700", 
      height: "400", 
      dataFormat: "json",
      dataSource: {
        chart: {
          caption: "Expected Returns",
          xAxisName: "Exit Price",
          yAxisName: "Expected Return",
          theme: "fusion"
        },
        data: chartData
      }
    };

    setChartData(chartData);
    setChartConfigs(chartConfigs);
    setShowChart(true);
  };

  /* Handle Calc LP Returns */
  const handleCalcLpReturns = (e) => {
    const form = e.currentTarget;
    const pair = form.pair.value;
    const begin = form.begin.value;
    const end = form.end.value;
    const size = form.size.value;
    calcLpReturns(pair, begin, end, size);
    e.preventDefault();
  };

  /* Handle Calc Expected Returns */
  const handleCalcExpectedReturns = (e) => {
    const form = e.currentTarget;
    const pair = form.pair.value;
    const begin = form.begin.value;
    const end = form.end.value;
    const eprice = form.eprice.value;
    const size = form.size.value;
    const flow = form.flow.value;
    const postime = form.postime.value;
    calcExpectedReturns(pair, begin, end, eprice, size, flow, postime);
    e.preventDefault();
  };
  
  const chart = showChart ? <ReactFC {...chartConfigs} /> : null;

  return (
    <Container style={{marginTop: '60px'}}>
        <Row>
            <Col />
            <Col> 
                <div style={{fontSize: '20px', textAlign: 'center'}}>Calculate LP Returns</div>
                <Card style={{padding: '12px', textAlign: 'center'}}>
                    <Card.Body>
                        <Form onSubmit={handleCalcLpReturns}>
                            <Form.Group controlId="pair">
                                <Form.Label>Pair </Form.Label>
                                <Form.Control required type="text" placeholder="Enter pair" />
                            </Form.Group>
                            <Form.Group controlId="begin">
                                <Form.Label>Entry Block </Form.Label>
                                <Form.Control required type="number" placeholder="Enter entry block" />
                            </Form.Group>
                            <Form.Group controlId="end">
                                <Form.Label>Exit Block </Form.Label>
                                <Form.Control required type="number" placeholder="Enter exit block" />
                            </Form.Group>
                            <Form.Group controlId="size">
                                <Form.Label>Position Size </Form.Label>
                                <Form.Control required type="number" placeholder="Enter position size" />
                            </Form.Group>
                            <br></br>
                            <Button variant="primary" type="submit"> Calculate LP Returns</Button>
                        </Form>
                    </Card.Body>
                </Card>
                <Card style={{padding: '12px', textAlign: 'center'}}> Total LP Returns: {lpReturn} </Card>
                <br>
                </br>
                <div style={{fontSize: '20px', textAlign: 'center'}}>Calculate Expected Returns</div>

                <Card style={{padding: '12px', textAlign: 'center'}}>
                    <Card.Body>
                        <Form onSubmit={handleCalcExpectedReturns}>
                            <Form.Group controlId="pair">
                                <Form.Label>Pair </Form.Label>
                                <Form.Control required type="text" placeholder="Enter pair" />
                            </Form.Group>
                            <Form.Group controlId="begin">
                                <Form.Label>Entry Block </Form.Label>
                                <Form.Control required type="number" placeholder="Enter entry block" />
                            </Form.Group>
                            <Form.Group controlId="end">
                                <Form.Label>Exit Block </Form.Label>
                                <Form.Control required type="number" placeholder="Enter exit block" />
                            </Form.Group>
                            <Form.Group controlId="eprice">
                                <Form.Label>Entry Price </Form.Label>
                                <Form.Control required type="text" placeholder="Enter entry price" />
                            </Form.Group>
                            <Form.Group controlId="size">
                                <Form.Label>Position Size </Form.Label>
                                <Form.Control required type="number" placeholder="Enter position size" />
                            </Form.Group>
                            <Form.Group controlId="flow">
                                <Form.Label>Flow </Form.Label>
                                <Form.Control required type="float" precision={3} placeholder="Enter flow" />
                            </Form.Group>
                            <Form.Group controlId="postime">
                                <Form.Label>Position Time </Form.Label>
                                <Form.Control required type="number" placeholder="Enter position time" />
                            </Form.Group>
                            <br></br>
                            <Button variant="primary" type="submit"> Calculate Expected Returns</Button>
                        </Form>
                    </Card.Body>
                </Card>

                <div style={{padding: '12px', textAlign: 'center'}}>
                {chart}
                </div>
                
            </Col>
            <Col />
        </Row>

    </Container>
  );
}

export default App;
