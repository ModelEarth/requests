# Storyboard for “Active&nbsp;Reader”&nbsp;layouts

We're creating galleries that reside adjacent to reading material and prompting processes to increase reading rates for K-12 graders - during visual story generation. &nbsp;The current page layout is structured to display prompted gallery images adjacent to related text.  We also display output within our [JQuery Gallery](gallery) and via our [FeedPlayer](../feed).<!-- or [React Gallery](https://model.earth/react-gallery/view/)  On narrow screen, the gallery appears above the text. Generated in different aspect ratios-->

Images are loaded into the side gallery (to the right) via the Github JavaScript API.  Prompt .csv files were created using location data on industry levels and [related tradeflow factors](../exiobase/tradeflow/).  

Flowcharts in [FloraFauna](https://www.florafauna.ai) and [ComfyUI](https://docs.comfy.org/get_started/introduction) provide editors with scene overviews based on flowcharts, similar to integrating [data-pipelines](/data-pipeline/admin) in storyboards. 

About our Rust implementation's [API Provider Architecture](engine/rust-api/src/providers)