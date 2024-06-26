[International Trade](/useeio.js/footprint/)
# Harmonized System (HS)

[How to use R-Language libraries in a Python CoLab (2nd example)](https://www.geeksforgeeks.org/how-to-use-r-with-google-colaboratory/)

[Our CoLab](https://colab.research.google.com/drive/1etpn1no8JgeUxwLr_5dBFEbt8sq5wd4v?usp=sharing)

Sample use of [Product HS Codes](https://model.georgia.org/display/exporters/)

## Concordance

We use an R package called [Concordance](https://github.com/insongkim/concordance) for international industry lookups.

Concordance is the leading process for lookups:
Harmonized System (HS),  ISIC/SITC and NAICS

[Chinese sectors](https://chatgpt.com/share/dbb6de4b-1366-4190-b284-3b7165951c61),  ISIC,  and the Harmonized System (HS)

## 3 CSV Files

HS (4-digit)
HS-Description
NAICS (4-digits multiple)
NAICS-Description

HS (4-digit)
HS-Description
ISIC-Code (2-digits multiple)
ISIC-Description 

HS (4-digit)
HS-Description
Chinese-Sector-Code (2-digits)
Chinese-Sector-Description

## Chinese Sector Codes

From ChatGPT, so they may be incorrect...

<pre style="font-size: 12px;">
ISIC-Code, ISIC-Description, Chinese-Sector-Code, Chinese-Sector-Description  
01-03, Agriculture,  Forestry and Fishing, 01, Agriculture,  Forestry,  Animal Husbandry,  and Fishery
05-09, Mining and Quarrying, 02, Mining and Quarrying  
10-33, Manufacturing, 03, Manufacturing
35   , Electricity,  Gas,  Steam and Air Conditioning Supply, 04, Production and Supply of Electricity,  Heat,  Gas,  and Water
36-39, Water Supply; Sewerage,  Waste Management and Remediation Activities, 04, Production and Supply of Electricity,  Heat,  Gas,  and Water
41-43, Construction, 05, Construction
45-47, Wholesale and Retail Trade; Repair of Motor Vehicles and Motorcycles, 06, Wholesale and Retail Trade
49-53, Transportation and Storage, 07, Transport,  Storage,  and Post
55-56, Accommodation and Food Service Activities, 08, Accommodation and Catering Services
58-63, Information and Communication, 09, Information Transmission,  Software,  and Information Technology Services
64-66, Financial and Insurance Activities, 10, Financial Intermediation
68, Real Estate Activities, 11, Real Estate
69-75, Professional,  Scientific and Technical Activities, 12, Scientific Research and Technical Services
77-82, Administrative and Support Service Activities, 13, Professional Services
84   , Public Administration and Defense; Compulsory Social Security, 14, Public Management,  Social Security,  and Social Organization
85   , Education, 15, Education
86-88, Human Health and Social Work Activities, 16, Health and Social Work
90-93, Arts,  Entertainment and Recreation, 17, Culture,  Sports,  and Entertainment
94-96, Other Service Activities, 18, Other Services
97   , Activities of Households as Employers; Undifferentiated Goods- and Services-Producing Activities of Households for Own Use, 18, Other Services
99   , Activities of Extraterritorial Organizations and Bodies, 14, Public Management,  Social Security,  and Social Organization
</pre>

<!--
The "ISIC_Code" column lists the ISIC codes,  using numerical ranges to denote broad categories.
The "ISIC_Description" column provides a description of each ISIC category.
The "Chinese_Sector_Code" column lists the corresponding numerical sector codes in the Chinese classification system.
The "Chinese_Sector_Description" column provides a description of each corresponding Chinese sector.
-->
<br>

# Our prompt for top 10 products

Prompt:
"I'm working on a solution to reduce environmental impacts caused by [product] in [location] with my [pet]"
