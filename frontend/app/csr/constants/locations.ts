/* ─── US STATES ─── */
export const US_STATES = [
  { code:"AL",name:"Alabama"              },{ code:"AK",name:"Alaska"               },
  { code:"AZ",name:"Arizona"              },{ code:"AR",name:"Arkansas"             },
  { code:"CA",name:"California"           },{ code:"CO",name:"Colorado"             },
  { code:"CT",name:"Connecticut"          },{ code:"DE",name:"Delaware"             },
  { code:"FL",name:"Florida"              },{ code:"GA",name:"Georgia"              },
  { code:"HI",name:"Hawaii"               },{ code:"ID",name:"Idaho"                },
  { code:"IL",name:"Illinois"             },{ code:"IN",name:"Indiana"              },
  { code:"IA",name:"Iowa"                 },{ code:"KS",name:"Kansas"               },
  { code:"KY",name:"Kentucky"             },{ code:"LA",name:"Louisiana"            },
  { code:"ME",name:"Maine"                },{ code:"MD",name:"Maryland"             },
  { code:"MA",name:"Massachusetts"        },{ code:"MI",name:"Michigan"             },
  { code:"MN",name:"Minnesota"            },{ code:"MS",name:"Mississippi"          },
  { code:"MO",name:"Missouri"             },{ code:"MT",name:"Montana"              },
  { code:"NE",name:"Nebraska"             },{ code:"NV",name:"Nevada"               },
  { code:"NH",name:"New Hampshire"        },{ code:"NJ",name:"New Jersey"           },
  { code:"NM",name:"New Mexico"           },{ code:"NY",name:"New York"             },
  { code:"NC",name:"North Carolina"       },{ code:"ND",name:"North Dakota"         },
  { code:"OH",name:"Ohio"                 },{ code:"OK",name:"Oklahoma"             },
  { code:"OR",name:"Oregon"               },{ code:"PA",name:"Pennsylvania"         },
  { code:"RI",name:"Rhode Island"         },{ code:"SC",name:"South Carolina"       },
  { code:"SD",name:"South Dakota"         },{ code:"TN",name:"Tennessee"            },
  { code:"TX",name:"Texas"                },{ code:"UT",name:"Utah"                 },
  { code:"VT",name:"Vermont"              },{ code:"VA",name:"Virginia"             },
  { code:"WA",name:"Washington"           },{ code:"WV",name:"West Virginia"        },
  { code:"WI",name:"Wisconsin"            },{ code:"WY",name:"Wyoming"              },
  { code:"DC",name:"Washington D.C."      },
];

/* ─── CANADIAN PROVINCES ─── */
export const CA_PROVINCES = [
  { code:"AB",name:"Alberta"                   },{ code:"BC",name:"British Columbia"      },
  { code:"MB",name:"Manitoba"                  },{ code:"NB",name:"New Brunswick"         },
  { code:"NL",name:"Newfoundland and Labrador" },{ code:"NS",name:"Nova Scotia"           },
  { code:"NT",name:"Northwest Territories"     },{ code:"NU",name:"Nunavut"               },
  { code:"ON",name:"Ontario"                   },{ code:"PE",name:"Prince Edward Island"  },
  { code:"QC",name:"Quebec"                    },{ code:"SK",name:"Saskatchewan"          },
  { code:"YT",name:"Yukon"                     },
];

/* ─── PHONE AREA CODES PER STATE / PROVINCE ─── */
export const STATE_AREA_CODES: Record<string, string[]> = {
  "Alabama":                    ["205","251","256","334","938"],
  "Alaska":                     ["907"],
  "Arizona":                    ["480","520","602","623","928"],
  "Arkansas":                   ["479","501","870"],
  "California":                 ["209","213","310","323","408","415","424","442","510","530","559","562","619","626","628","650","657","661","669","707","714","747","760","805","818","820","831","858","909","916","925","949","951"],
  "Colorado":                   ["303","719","720","970"],
  "Connecticut":                ["203","475","860","959"],
  "Delaware":                   ["302"],
  "Florida":                    ["239","305","321","352","386","407","561","727","754","772","786","813","850","863","904","941","954"],
  "Georgia":                    ["229","404","470","478","678","706","762","770","912"],
  "Hawaii":                     ["808"],
  "Idaho":                      ["208","986"],
  "Illinois":                   ["217","224","309","312","331","618","630","708","773","779","815","847","872"],
  "Indiana":                    ["219","260","317","463","574","765","812","930"],
  "Iowa":                       ["319","515","563","641","712"],
  "Kansas":                     ["316","620","785","913"],
  "Kentucky":                   ["270","364","502","606","859"],
  "Louisiana":                  ["225","318","337","504","985"],
  "Maine":                      ["207"],
  "Maryland":                   ["240","301","410","443","667"],
  "Massachusetts":              ["339","351","413","508","617","774","781","857","978"],
  "Michigan":                   ["231","248","269","313","517","586","616","734","810","906","947","989"],
  "Minnesota":                  ["218","320","507","612","651","763","952"],
  "Mississippi":                ["228","601","662","769"],
  "Missouri":                   ["314","417","573","636","660","816"],
  "Montana":                    ["406"],
  "Nebraska":                   ["308","402","531"],
  "Nevada":                     ["702","725","775"],
  "New Hampshire":              ["603"],
  "New Jersey":                 ["201","551","609","640","732","848","856","862","908","973"],
  "New Mexico":                 ["505","575"],
  "New York":                   ["212","315","332","347","516","518","585","607","631","646","680","716","718","838","845","914","917","929","934"],
  "North Carolina":             ["252","336","704","743","828","910","919","980","984"],
  "North Dakota":               ["701"],
  "Ohio":                       ["216","220","234","283","326","330","380","419","440","513","567","614","740","937"],
  "Oklahoma":                   ["405","539","572","580","918"],
  "Oregon":                     ["458","503","541","971"],
  "Pennsylvania":               ["215","223","267","272","412","445","484","570","582","610","717","724","814","878"],
  "Rhode Island":               ["401"],
  "South Carolina":             ["803","839","843","854","864"],
  "South Dakota":               ["605"],
  "Tennessee":                  ["423","615","629","731","865","901","931"],
  "Texas":                      ["210","214","254","281","325","346","361","409","430","432","469","512","682","713","726","737","806","817","830","832","903","915","936","940","945","956","972","979"],
  "Utah":                       ["385","435","801"],
  "Vermont":                    ["802"],
  "Virginia":                   ["276","434","540","571","703","757","804"],
  "Washington":                 ["206","253","360","425","509","564"],
  "Washington D.C.":            ["202"],
  "West Virginia":              ["304","681"],
  "Wisconsin":                  ["262","414","534","608","715","920"],
  "Wyoming":                    ["307"],
  /* Canada */
  "Alberta":                    ["403","587","780","825"],
  "British Columbia":           ["236","250","604","672","778"],
  "Manitoba":                   ["204","431"],
  "New Brunswick":              ["506"],
  "Newfoundland and Labrador":  ["709"],
  "Nova Scotia":                ["782","902"],
  "Northwest Territories":      ["867"],
  "Nunavut":                    ["867"],
  "Ontario":                    ["226","249","289","343","365","416","437","519","548","613","647","705","807","905"],
  "Prince Edward Island":       ["782","902"],
  "Quebec":                     ["367","418","438","450","514","579","581","819","873"],
  "Saskatchewan":               ["306","639"],
  "Yukon":                      ["867"],
};

export const stateMatches = (itemState: string, filterName: string): boolean => {
  const s = (itemState ?? "").trim().toLowerCase();
  if (!s || !filterName.trim()) return false;
  const f = filterName.trim().toLowerCase();
  if (s === f) return true;

  const allLocations = [...US_STATES, ...CA_PROVINCES];
  const target =
    allLocations.find(l => l.name.toLowerCase() === f) ??
    allLocations.find(l => l.code.toLowerCase() === f);

  if (target) {
    const code = target.code.toLowerCase();
    const name = target.name.toLowerCase();

    const filterIsDC = code === "dc" || name.includes("d.c.");
    const itemIsDC =
      /\bd\.?\s*c\.?\b/.test(s) ||
      s.includes("district of columbia") ||
      s.endsWith(", dc") ||
      s.endsWith(" dc");

    if (filterIsDC !== itemIsDC && (code === "wa" || code === "dc" || name.startsWith("washington"))) {
      return false;
    }

    if (s === code || s === name) return true;
    const parts = s.split(/[,/|·]/).map(p => p.trim()).filter(Boolean);
    if (parts.some(p => p === code || p === name)) return true;
    if (parts.some(p => p.includes(name) || name.includes(p))) return true;
    if (s.endsWith(` ${code}`) || s.endsWith(`, ${code}`)) return true;
    if (s.includes(name)) return true;
    return false;
  }

  return s.includes(f);
};
