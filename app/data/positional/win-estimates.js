export default {
  "schemaVersion": 1,
  "version": "maia79m-winprob-strict50-20261019-v1",
  "status": "approved",
  "model": "Maia3-79M",
  "modelSha256": "3fc6181d5db789b45a15305732148757ae74efa3e0028e81ba335b462dac45c2",
  "metric": "outright_win_probability",
  "pov": "original_mover_after_selected_move",
  "corpusVersion": "positional-training-strict50-20261018-v1",
  "corpusPublicSha256": "a45c2167493b1733fac44bca5eab8b687606c4383190495195941af437b8a257",
  "comparisonDirectionLabel": "Approved good move → mistake",
  "bindingSerialization": "SHA256 of UTF-8 recursively key-sorted compact JSON over {caseId,fen,initialFen,movesUci,options:[{uci,san,isBad}] sorted by UCI,referenceGoodUci}; no whitespace or numeric fields. Theme metadata is excluded.",
  "disclaimer": "Single-forward Maia3-79M estimates with both players conditioned at the displayed rating. These are outright win probabilities, not expected scores, rollouts, measured human success rates or calibrated playing-strength claims. The good reference is fixed by the approved Stockfish10M binary selection, not chosen to maximize the model gap. Signed disagreements are retained.",
  "missingData": "Show unavailable if case, rating or exact position/options/history binding is missing or mismatched. Do not substitute a score, another rating, another position or a model policy probability.",
  "evidence": {
    "inputManifestSha256": "d8c2de828317d4426f77466a19bf5e0b51ffe00d45d03ed4957f70ec38129820",
    "fullHeadsSha256": "e41ba737c61b6149898f8e0171f31988201c47df31c0e216f485e827868f149f",
    "timingSha256": "acd28200995daa435c1478220f10de80b103c88ddc2cc495385e4e96b88da9e8"
  },
  "cases": {
    "g01330_p029": {
      "caseId": "g01330_p029",
      "publicCaseSha256": "6724d4056c860b35cb44eb678f38c7183f948f8c61f4db1a016d1765aee222e9",
      "positionOptionsSha256": "fd64c373c4397a6f1909bdbad52690d8e0593b95a10421012b35179d6832dd41",
      "fen": "r3kb1r/4qpp1/n2p1n1p/p1pPp3/Pp2P3/1B2BQ1P/1PP1NPP1/R4RK1 w kq - 0 15",
      "badUci": "c2c4",
      "referenceGoodUci": "b3c4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "b3c4": {
              "winProbability": 0.5043799877166748,
              "drawProbability": 0.036379169672727585,
              "lossProbability": 0.4592408835887909
            },
            "c2c4": {
              "winProbability": 0.42201417684555054,
              "drawProbability": 0.050605833530426025,
              "lossProbability": 0.5273799896240234
            }
          },
          "goodMinusBadWinPercentagePoints": 8.236581087112427,
          "mistakeMinusGoodWinPercentagePoints": -8.236581087112427
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "b3c4": {
              "winProbability": 0.6719063520431519,
              "drawProbability": 0.06779200583696365,
              "lossProbability": 0.2603015899658203
            },
            "c2c4": {
              "winProbability": 0.5440509915351868,
              "drawProbability": 0.09695597738027573,
              "lossProbability": 0.3589930236339569
            }
          },
          "goodMinusBadWinPercentagePoints": 12.785536050796509,
          "mistakeMinusGoodWinPercentagePoints": -12.785536050796509
        }
      }
    },
    "g01401_p023": {
      "caseId": "g01401_p023",
      "publicCaseSha256": "2f65c997159a4ffe409a1ac7e53230f6ad972fb6f618e2de4f703d8039a2f7a4",
      "positionOptionsSha256": "21579923fbc064e3dc0a06a4f6ffd4f02aeaf7d0bfb315883caedbd2a47732f7",
      "fen": "r1b1k2r/ppp2ppp/4nn2/8/2N1P3/2PBB3/P1P2PPP/R3K2R w KQkq - 1 12",
      "badUci": "e4e5",
      "referenceGoodUci": "f2f3",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f2f3": {
              "winProbability": 0.6117280125617981,
              "drawProbability": 0.05069761350750923,
              "lossProbability": 0.3375743627548218
            },
            "e4e5": {
              "winProbability": 0.5335930585861206,
              "drawProbability": 0.04992269352078438,
              "lossProbability": 0.4164842367172241
            }
          },
          "goodMinusBadWinPercentagePoints": 7.813495397567749,
          "mistakeMinusGoodWinPercentagePoints": -7.813495397567749
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f2f3": {
              "winProbability": 0.6465507745742798,
              "drawProbability": 0.10345900058746338,
              "lossProbability": 0.24999025464057922
            },
            "e4e5": {
              "winProbability": 0.557509183883667,
              "drawProbability": 0.12397634983062744,
              "lossProbability": 0.31851452589035034
            }
          },
          "goodMinusBadWinPercentagePoints": 8.90415906906128,
          "mistakeMinusGoodWinPercentagePoints": -8.90415906906128
        }
      }
    },
    "g00806_p028": {
      "caseId": "g00806_p028",
      "publicCaseSha256": "74613a4415c4b7e04bd5a752bbed448c73c641e1a072f78c32a2f1381057e887",
      "positionOptionsSha256": "6db4d60372dab94582183c041e9f0f1e3e4e5ba9d3b0bdd22cd006d2757c0db6",
      "fen": "2kr3r/ppp2pp1/2npq2p/4pN2/4P3/P2PP3/1PP3PP/R2Q1RK1 b - - 1 14",
      "badUci": "e6g6",
      "referenceGoodUci": "g7g6",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "g7g6": {
              "winProbability": 0.4851553738117218,
              "drawProbability": 0.037443939596414566,
              "lossProbability": 0.4774007201194763
            },
            "e6g6": {
              "winProbability": 0.26763904094696045,
              "drawProbability": 0.02793852612376213,
              "lossProbability": 0.7044224739074707
            }
          },
          "goodMinusBadWinPercentagePoints": 21.751633286476135,
          "mistakeMinusGoodWinPercentagePoints": -21.751633286476135
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "g7g6": {
              "winProbability": 0.43586277961730957,
              "drawProbability": 0.11097726225852966,
              "lossProbability": 0.45315995812416077
            },
            "e6g6": {
              "winProbability": 0.24120765924453735,
              "drawProbability": 0.07774268835783005,
              "lossProbability": 0.681049644947052
            }
          },
          "goodMinusBadWinPercentagePoints": 19.46551203727722,
          "mistakeMinusGoodWinPercentagePoints": -19.46551203727722
        }
      }
    },
    "g03358_p047": {
      "caseId": "g03358_p047",
      "publicCaseSha256": "2ce33c528d3066b74ea32e612a596271b7a10fd894f930cd87ff5f546cb4e0b5",
      "positionOptionsSha256": "12ac1102025e468b42e4e2c1fa3e2f3b05341a296eadfdb3bcc9e2f2ea9fbb06",
      "fen": "1r1b4/2p2kpp/3p2n1/1p2p2n/1P2P3/2PPB2P/5PPK/R4R2 w - - 2 24",
      "badUci": "g2g4",
      "referenceGoodUci": "a1a7",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "a1a7": {
              "winProbability": 0.4669475853443146,
              "drawProbability": 0.06792303174734116,
              "lossProbability": 0.4651293456554413
            },
            "g2g4": {
              "winProbability": 0.3624361455440521,
              "drawProbability": 0.07231039553880692,
              "lossProbability": 0.565253496170044
            }
          },
          "goodMinusBadWinPercentagePoints": 10.451143980026245,
          "mistakeMinusGoodWinPercentagePoints": -10.451143980026245
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "a1a7": {
              "winProbability": 0.4015759229660034,
              "drawProbability": 0.15149739384651184,
              "lossProbability": 0.44692671298980713
            },
            "g2g4": {
              "winProbability": 0.24787315726280212,
              "drawProbability": 0.12296535074710846,
              "lossProbability": 0.629161536693573
            }
          },
          "goodMinusBadWinPercentagePoints": 15.37027657032013,
          "mistakeMinusGoodWinPercentagePoints": -15.37027657032013
        }
      }
    },
    "g01892_p023": {
      "caseId": "g01892_p023",
      "publicCaseSha256": "c9a787170b21863f5a6634c5c27d5c5e0dc2dbb25ec2b327c6bc1c3f6ee79dc3",
      "positionOptionsSha256": "8718d4bf57cb0cbd78def93145540f4b9215f00c2771f4d82cc91381274e751d",
      "fen": "r3k2r/pbpqbppp/2p2n2/8/B2pPB2/3P4/PPP1NPPP/R2Q1RK1 w kq - 5 12",
      "badUci": "e4e5",
      "referenceGoodUci": "c2c3",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "c2c3": {
              "winProbability": 0.6520114541053772,
              "drawProbability": 0.020919131115078926,
              "lossProbability": 0.32706940174102783
            },
            "e4e5": {
              "winProbability": 0.565361499786377,
              "drawProbability": 0.019896168261766434,
              "lossProbability": 0.4147423207759857
            }
          },
          "goodMinusBadWinPercentagePoints": 8.664995431900024,
          "mistakeMinusGoodWinPercentagePoints": -8.664995431900024
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "c2c3": {
              "winProbability": 0.8039397597312927,
              "drawProbability": 0.032912712544202805,
              "lossProbability": 0.16314749419689178
            },
            "e4e5": {
              "winProbability": 0.6791685223579407,
              "drawProbability": 0.046501364558935165,
              "lossProbability": 0.27433013916015625
            }
          },
          "goodMinusBadWinPercentagePoints": 12.477123737335205,
          "mistakeMinusGoodWinPercentagePoints": -12.477123737335205
        }
      }
    },
    "g04432_p023": {
      "caseId": "g04432_p023",
      "publicCaseSha256": "d0f0b0e3c21f8d3944048fa16d7c056019a7b4ce39485c1bcdf7204b631e268f",
      "positionOptionsSha256": "0b40f35dbedb568a031ba4181c5ed0f8bbb3190b4f1199ee0dce83cabb77e119",
      "fen": "r1bqr1k1/1pp2ppp/4pn2/p2n4/P7/B1P2NP1/2QPPPBP/R4RK1 w - - 6 12",
      "badUci": "f3d4",
      "referenceGoodUci": "d2d4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "d2d4": {
              "winProbability": 0.5883608460426331,
              "drawProbability": 0.027183204889297485,
              "lossProbability": 0.38445597887039185
            },
            "f3d4": {
              "winProbability": 0.5516830682754517,
              "drawProbability": 0.027458438649773598,
              "lossProbability": 0.4208585023880005
            }
          },
          "goodMinusBadWinPercentagePoints": 3.6677777767181396,
          "mistakeMinusGoodWinPercentagePoints": -3.6677777767181396
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "d2d4": {
              "winProbability": 0.6572662591934204,
              "drawProbability": 0.07061982899904251,
              "lossProbability": 0.2721138894557953
            },
            "f3d4": {
              "winProbability": 0.5323091149330139,
              "drawProbability": 0.08557083457708359,
              "lossProbability": 0.3821201026439667
            }
          },
          "goodMinusBadWinPercentagePoints": 12.49571442604065,
          "mistakeMinusGoodWinPercentagePoints": -12.49571442604065
        }
      }
    },
    "g03680_p025": {
      "caseId": "g03680_p025",
      "publicCaseSha256": "46591935fef7ff176e55d40e4d7ed1b0553feef61b510291196ef4ec1f88e8dc",
      "positionOptionsSha256": "bf93759d91ec0a06fa260fbc67219695949e3a8b3c075e6e9f2de71bd4b59f5d",
      "fen": "r2qk2r/pp1npp1p/2p1bn1B/8/3P2pN/6P1/PPP2PBP/R2Q1RK1 w kq - 1 13",
      "badUci": "h6g7",
      "referenceGoodUci": "f1e1",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f1e1": {
              "winProbability": 0.6274839043617249,
              "drawProbability": 0.022238649427890778,
              "lossProbability": 0.3502774238586426
            },
            "h6g7": {
              "winProbability": 0.5422989726066589,
              "drawProbability": 0.02763158082962036,
              "lossProbability": 0.4300694465637207
            }
          },
          "goodMinusBadWinPercentagePoints": 8.518493175506592,
          "mistakeMinusGoodWinPercentagePoints": -8.518493175506592
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f1e1": {
              "winProbability": 0.6896341443061829,
              "drawProbability": 0.05086073651909828,
              "lossProbability": 0.2595052123069763
            },
            "h6g7": {
              "winProbability": 0.6153376698493958,
              "drawProbability": 0.06673034280538559,
              "lossProbability": 0.31793197989463806
            }
          },
          "goodMinusBadWinPercentagePoints": 7.429647445678711,
          "mistakeMinusGoodWinPercentagePoints": -7.429647445678711
        }
      }
    },
    "g04576_p027": {
      "caseId": "g04576_p027",
      "publicCaseSha256": "132cba9c81af107bbd4385dccb94021555fe80837bd6a0d75fb08f6c549337ff",
      "positionOptionsSha256": "a0208b0e878e2c4e6690a86c8c5df3d19445ce8dcbcf961320d06a322977d52d",
      "fen": "r3kb1r/pp3pp1/3ppn2/1np3Np/4P3/4N3/1PPP1PPP/R1B1R1K1 w kq - 0 14",
      "badUci": "c2c4",
      "referenceGoodUci": "f2f4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f2f4": {
              "winProbability": 0.4426150321960449,
              "drawProbability": 0.03803420811891556,
              "lossProbability": 0.5193507671356201
            },
            "c2c4": {
              "winProbability": 0.3395603895187378,
              "drawProbability": 0.03829515352845192,
              "lossProbability": 0.6221444606781006
            }
          },
          "goodMinusBadWinPercentagePoints": 10.305464267730713,
          "mistakeMinusGoodWinPercentagePoints": -10.305464267730713
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f2f4": {
              "winProbability": 0.3800498843193054,
              "drawProbability": 0.09641530364751816,
              "lossProbability": 0.5235348343849182
            },
            "c2c4": {
              "winProbability": 0.22400358319282532,
              "drawProbability": 0.06529510766267776,
              "lossProbability": 0.7107012867927551
            }
          },
          "goodMinusBadWinPercentagePoints": 15.60463011264801,
          "mistakeMinusGoodWinPercentagePoints": -15.60463011264801
        }
      }
    },
    "g01423_p030": {
      "caseId": "g01423_p030",
      "publicCaseSha256": "d3f3233f48d82a8f6189e7e44aa594b29e584463909192a881f730630d420fc1",
      "positionOptionsSha256": "436d786686f710340cfd65b2f122969384d897682006a2b7fddc1f217514dc0a",
      "fen": "r1b1k2r/pp2nppp/5q2/3p4/8/2NPb1B1/PP4PP/RK1Q1B1R b kq - 1 15",
      "badUci": "d5d4",
      "referenceGoodUci": "e8g8",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "e8g8": {
              "winProbability": 0.6885532140731812,
              "drawProbability": 0.014951191842556,
              "lossProbability": 0.2964955270290375
            },
            "d5d4": {
              "winProbability": 0.6154669523239136,
              "drawProbability": 0.01604926772415638,
              "lossProbability": 0.3684837520122528
            }
          },
          "goodMinusBadWinPercentagePoints": 7.308626174926758,
          "mistakeMinusGoodWinPercentagePoints": -7.308626174926758
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "e8g8": {
              "winProbability": 0.7904865145683289,
              "drawProbability": 0.03584693744778633,
              "lossProbability": 0.1736665964126587
            },
            "d5d4": {
              "winProbability": 0.6228197813034058,
              "drawProbability": 0.05381788685917854,
              "lossProbability": 0.3233623802661896
            }
          },
          "goodMinusBadWinPercentagePoints": 16.76667332649231,
          "mistakeMinusGoodWinPercentagePoints": -16.76667332649231
        }
      }
    },
    "g01344_p046": {
      "caseId": "g01344_p046",
      "publicCaseSha256": "1c975b8d31fa9f983233e402373d7c44747ba8c0decbdb0aa1750e1fc04623ce",
      "positionOptionsSha256": "5b82e74ef7d687d08bdaf6a0b9961ba4fbba500b0921df83fff47809ec01d9d0",
      "fen": "2r3r1/p6p/1p1Rpk2/8/1Bp5/2P3Pb/P4P1P/4R1K1 b - - 1 23",
      "badUci": "g8f8",
      "referenceGoodUci": "g8d8",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "g8d8": {
              "winProbability": 0.5777758359909058,
              "drawProbability": 0.0714755430817604,
              "lossProbability": 0.35074856877326965
            },
            "g8f8": {
              "winProbability": 0.43308737874031067,
              "drawProbability": 0.05172739550471306,
              "lossProbability": 0.5151851773262024
            }
          },
          "goodMinusBadWinPercentagePoints": 14.46884572505951,
          "mistakeMinusGoodWinPercentagePoints": -14.46884572505951
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "g8d8": {
              "winProbability": 0.44565826654434204,
              "drawProbability": 0.18823285400867462,
              "lossProbability": 0.36610886454582214
            },
            "g8f8": {
              "winProbability": 0.2473578006029129,
              "drawProbability": 0.1009826809167862,
              "lossProbability": 0.6516594886779785
            }
          },
          "goodMinusBadWinPercentagePoints": 19.830046594142914,
          "mistakeMinusGoodWinPercentagePoints": -19.830046594142914
        }
      }
    },
    "g03717_p061": {
      "caseId": "g03717_p061",
      "publicCaseSha256": "7fb955f752bd8051702828ee07ccff1843f37e2cda2002bd7e8291ca37dd33d2",
      "positionOptionsSha256": "67970dc1d4aa57c8bdeedb085ec41a9a4e54d571815813762df4c7e32752b354",
      "fen": "4rnk1/1pq2pp1/p1p1b2p/P1P1p1b1/1P2P3/1N4P1/2QN1PP1/R4RK1 w - - 1 31",
      "badUci": "f2f3",
      "referenceGoodUci": "a1d1",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "a1d1": {
              "winProbability": 0.6090695261955261,
              "drawProbability": 0.0270098764449358,
              "lossProbability": 0.3639206290245056
            },
            "f2f3": {
              "winProbability": 0.5254730582237244,
              "drawProbability": 0.02727327309548855,
              "lossProbability": 0.44725364446640015
            }
          },
          "goodMinusBadWinPercentagePoints": 8.359646797180176,
          "mistakeMinusGoodWinPercentagePoints": -8.359646797180176
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "a1d1": {
              "winProbability": 0.7484065890312195,
              "drawProbability": 0.05063699185848236,
              "lossProbability": 0.20095644891262054
            },
            "f2f3": {
              "winProbability": 0.6052500009536743,
              "drawProbability": 0.06527041643857956,
              "lossProbability": 0.3294796049594879
            }
          },
          "goodMinusBadWinPercentagePoints": 14.315658807754517,
          "mistakeMinusGoodWinPercentagePoints": -14.315658807754517
        }
      }
    },
    "low_g00143_p020": {
      "caseId": "low_g00143_p020",
      "publicCaseSha256": "8d15a916b5b27abfae4dd935fbc97da5c9080244161611c46cb938ada73d38ba",
      "positionOptionsSha256": "48169af7a433fb11da9254f47a2cdb8d444ddd8faa075732ce2223a8909eec61",
      "fen": "r1bq1rk1/ppppbppp/8/3P4/3p1B2/3P4/PPP1BPPP/R2Q1RK1 b - - 1 10",
      "badUci": "c7c5",
      "referenceGoodUci": "b7b6",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "b7b6": {
              "winProbability": 0.4357394874095917,
              "drawProbability": 0.03668104112148285,
              "lossProbability": 0.5275794863700867
            },
            "c7c5": {
              "winProbability": 0.4065569341182709,
              "drawProbability": 0.03778096288442612,
              "lossProbability": 0.5556620955467224
            }
          },
          "goodMinusBadWinPercentagePoints": 2.91825532913208,
          "mistakeMinusGoodWinPercentagePoints": -2.91825532913208
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "b7b6": {
              "winProbability": 0.3634352385997772,
              "drawProbability": 0.14000898599624634,
              "lossProbability": 0.49655574560165405
            },
            "c7c5": {
              "winProbability": 0.36628490686416626,
              "drawProbability": 0.12000757455825806,
              "lossProbability": 0.5137074589729309
            }
          },
          "goodMinusBadWinPercentagePoints": -0.2849668264389038,
          "mistakeMinusGoodWinPercentagePoints": 0.2849668264389038
        }
      }
    },
    "g00672_p018": {
      "caseId": "g00672_p018",
      "publicCaseSha256": "f660ebdd48f87d3fbdd405407a3b0fff37fe8cbf6a5a770ea09582411107906c",
      "positionOptionsSha256": "b26f4aab18e4033c45430057851c4938452f9ca6d0b4dcd168e6e2935f4e8d31",
      "fen": "r1bqkb1r/ppp2pp1/2np3p/8/2B1P3/2N5/PPPQ1PPP/R1B2RK1 b kq - 2 9",
      "badUci": "e8e7",
      "referenceGoodUci": "f8e7",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f8e7": {
              "winProbability": 0.5013012290000916,
              "drawProbability": 0.029560212045907974,
              "lossProbability": 0.4691385328769684
            },
            "e8e7": {
              "winProbability": 0.24576163291931152,
              "drawProbability": 0.018772827461361885,
              "lossProbability": 0.7354655265808105
            }
          },
          "goodMinusBadWinPercentagePoints": 25.553959608078003,
          "mistakeMinusGoodWinPercentagePoints": -25.553959608078003
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f8e7": {
              "winProbability": 0.4023071825504303,
              "drawProbability": 0.11862866580486298,
              "lossProbability": 0.4790641665458679
            },
            "e8e7": {
              "winProbability": 0.1440097689628601,
              "drawProbability": 0.04540151357650757,
              "lossProbability": 0.8105886578559875
            }
          },
          "goodMinusBadWinPercentagePoints": 25.82974135875702,
          "mistakeMinusGoodWinPercentagePoints": -25.82974135875702
        }
      }
    },
    "g03476_p021": {
      "caseId": "g03476_p021",
      "publicCaseSha256": "6527c5dd2f35949aeb1ef8d89b611c674fd4cf5cea7b75d174e8f80c5c83f92c",
      "positionOptionsSha256": "8f266b1117dfa154c3494d1c56f2a7eb62fb3d4d9353388019e5459996b149e0",
      "fen": "r6r/ppp1kp2/2p1bp1p/2b1p3/4P3/1P3P2/P1PN2PP/R3KBNR w KQ - 1 11",
      "badUci": "c2c4",
      "referenceGoodUci": "f1c4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f1c4": {
              "winProbability": 0.6329929232597351,
              "drawProbability": 0.05665968358516693,
              "lossProbability": 0.31034743785858154
            },
            "c2c4": {
              "winProbability": 0.5342459082603455,
              "drawProbability": 0.055369339883327484,
              "lossProbability": 0.41038474440574646
            }
          },
          "goodMinusBadWinPercentagePoints": 9.874701499938965,
          "mistakeMinusGoodWinPercentagePoints": -9.874701499938965
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f1c4": {
              "winProbability": 0.7770832777023315,
              "drawProbability": 0.05794038996100426,
              "lossProbability": 0.1649763286113739
            },
            "c2c4": {
              "winProbability": 0.604973554611206,
              "drawProbability": 0.0759357362985611,
              "lossProbability": 0.31909075379371643
            }
          },
          "goodMinusBadWinPercentagePoints": 17.21097230911255,
          "mistakeMinusGoodWinPercentagePoints": -17.21097230911255
        }
      }
    },
    "g00112_p018": {
      "caseId": "g00112_p018",
      "publicCaseSha256": "e986c4b55fb04525436c566c05ea1f066e1b0c59fdcd466ae330af30d21a9839",
      "positionOptionsSha256": "cecc1c24d5aa549e8ab47999e1a15db21417f4367cc03985dd3bc67d94ffbf36",
      "fen": "r1bq1rk1/ppp1bppp/3p1n2/8/2BQP3/2N4P/PPP2PP1/R1B2RK1 b - - 0 9",
      "badUci": "c7c5",
      "referenceGoodUci": "c7c6",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "c7c6": {
              "winProbability": 0.46717920899391174,
              "drawProbability": 0.03330516070127487,
              "lossProbability": 0.4995156526565552
            },
            "c7c5": {
              "winProbability": 0.42376279830932617,
              "drawProbability": 0.03341135010123253,
              "lossProbability": 0.5428258180618286
            }
          },
          "goodMinusBadWinPercentagePoints": 4.341641068458557,
          "mistakeMinusGoodWinPercentagePoints": -4.341641068458557
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "c7c6": {
              "winProbability": 0.3882913887500763,
              "drawProbability": 0.11139223724603653,
              "lossProbability": 0.500316321849823
            },
            "c7c5": {
              "winProbability": 0.3756425678730011,
              "drawProbability": 0.10935360938310623,
              "lossProbability": 0.5150037407875061
            }
          },
          "goodMinusBadWinPercentagePoints": 1.2648820877075195,
          "mistakeMinusGoodWinPercentagePoints": -1.2648820877075195
        }
      }
    },
    "g02061_p027": {
      "caseId": "g02061_p027",
      "publicCaseSha256": "c15db11d92226c73828cf717f3263478d5a8dca5f3318cf27df46f94e0bec885",
      "positionOptionsSha256": "7b8903132e5f02b12ceff84965bd295923ee8be64818133c0d3cad1e33133473",
      "fen": "r2q1rk1/pbp2pp1/5n1p/2p5/3pPP2/3P2N1/PPPQB1PP/R4RK1 w - - 1 14",
      "badUci": "e4e5",
      "referenceGoodUci": "e2f3",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "e2f3": {
              "winProbability": 0.6604446768760681,
              "drawProbability": 0.028352277353405952,
              "lossProbability": 0.3112030327320099
            },
            "e4e5": {
              "winProbability": 0.5512799024581909,
              "drawProbability": 0.029046794399619102,
              "lossProbability": 0.41967329382896423
            }
          },
          "goodMinusBadWinPercentagePoints": 10.91647744178772,
          "mistakeMinusGoodWinPercentagePoints": -10.91647744178772
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "e2f3": {
              "winProbability": 0.8211267590522766,
              "drawProbability": 0.0375460721552372,
              "lossProbability": 0.14132709801197052
            },
            "e4e5": {
              "winProbability": 0.706507682800293,
              "drawProbability": 0.06313004344701767,
              "lossProbability": 0.23036225140094757
            }
          },
          "goodMinusBadWinPercentagePoints": 11.461907625198364,
          "mistakeMinusGoodWinPercentagePoints": -11.461907625198364
        }
      }
    },
    "g01731_p051": {
      "caseId": "g01731_p051",
      "publicCaseSha256": "00eacf600f8b82dae080f6cf76aa5e6d03c99a3ad99da699de6c0595857a94c7",
      "positionOptionsSha256": "9cde6c06ac6a924f5ac8fb8c2292a245990b66aa19ab6994f17f17b93716d6e3",
      "fen": "r4rk1/4q1pp/p3pp2/P1Np1n2/8/2P1PP1P/1P3QP1/R2R2K1 w - - 1 26",
      "badUci": "c5d3",
      "referenceGoodUci": "e3e4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "e3e4": {
              "winProbability": 0.5949622392654419,
              "drawProbability": 0.04294860363006592,
              "lossProbability": 0.36208921670913696
            },
            "c5d3": {
              "winProbability": 0.54423588514328,
              "drawProbability": 0.04017527028918266,
              "lossProbability": 0.41558876633644104
            }
          },
          "goodMinusBadWinPercentagePoints": 5.0726354122161865,
          "mistakeMinusGoodWinPercentagePoints": -5.0726354122161865
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "e3e4": {
              "winProbability": 0.7814363837242126,
              "drawProbability": 0.05939456447958946,
              "lossProbability": 0.15916907787322998
            },
            "c5d3": {
              "winProbability": 0.641340970993042,
              "drawProbability": 0.08269273489713669,
              "lossProbability": 0.27596625685691833
            }
          },
          "goodMinusBadWinPercentagePoints": 14.009541273117065,
          "mistakeMinusGoodWinPercentagePoints": -14.009541273117065
        }
      }
    },
    "g04297_p023": {
      "caseId": "g04297_p023",
      "publicCaseSha256": "013ae2cc939a74e48b73681f4a6f224694ddb35ddbb02f287a8415b5e7112c8a",
      "positionOptionsSha256": "2d745b218c2e08301fa50e7dd205bded209cada8a4a3644db702d3fbc56ba9be",
      "fen": "r2q1rk1/1ppb1pp1/p1np1n1p/4p3/P2PP3/2P1PN1P/1P2B1P1/RN1Q1RK1 w - - 1 12",
      "badUci": "d4d5",
      "referenceGoodUci": "b1d2",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "b1d2": {
              "winProbability": 0.5131948590278625,
              "drawProbability": 0.03958536684513092,
              "lossProbability": 0.4472197890281677
            },
            "d4d5": {
              "winProbability": 0.41946032643318176,
              "drawProbability": 0.03887365013360977,
              "lossProbability": 0.5416659712791443
            }
          },
          "goodMinusBadWinPercentagePoints": 9.373453259468079,
          "mistakeMinusGoodWinPercentagePoints": -9.373453259468079
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "b1d2": {
              "winProbability": 0.4798126220703125,
              "drawProbability": 0.10040588676929474,
              "lossProbability": 0.41978150606155396
            },
            "d4d5": {
              "winProbability": 0.3759710192680359,
              "drawProbability": 0.09642746299505234,
              "lossProbability": 0.5276014804840088
            }
          },
          "goodMinusBadWinPercentagePoints": 10.384160280227661,
          "mistakeMinusGoodWinPercentagePoints": -10.384160280227661
        }
      }
    },
    "g01596_p030": {
      "caseId": "g01596_p030",
      "publicCaseSha256": "b0d8f183ea0dde2bf2e1d1d64bc8f0e5dca3651eb91aec47ecf7f000e69d95fb",
      "positionOptionsSha256": "d6bc88fe7ad1686e1fb34b2df528a3f6fa14493198d44866ce21890be5a1d90c",
      "fen": "r2qr1k1/pppbbpp1/4p1np/4n3/3NN3/2PBB3/PP2QPPP/R4RK1 b - - 1 15",
      "badUci": "c7c6",
      "referenceGoodUci": "c7c5",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "c7c5": {
              "winProbability": 0.6106904745101929,
              "drawProbability": 0.022487981244921684,
              "lossProbability": 0.3668215274810791
            },
            "c7c6": {
              "winProbability": 0.5217782855033875,
              "drawProbability": 0.02355017140507698,
              "lossProbability": 0.4546714723110199
            }
          },
          "goodMinusBadWinPercentagePoints": 8.891218900680542,
          "mistakeMinusGoodWinPercentagePoints": -8.891218900680542
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "c7c5": {
              "winProbability": 0.789369523525238,
              "drawProbability": 0.04036707058548927,
              "lossProbability": 0.1702633649110794
            },
            "c7c6": {
              "winProbability": 0.5011771321296692,
              "drawProbability": 0.060711584985256195,
              "lossProbability": 0.43811121582984924
            }
          },
          "goodMinusBadWinPercentagePoints": 28.819239139556885,
          "mistakeMinusGoodWinPercentagePoints": -28.819239139556885
        }
      }
    },
    "g02543_p043": {
      "caseId": "g02543_p043",
      "publicCaseSha256": "d02454303a229031cb475badcb759f7b799acd1021914ed26c44544ea18c35a6",
      "positionOptionsSha256": "b23e432cd2433680823401ca4fb40be66a28e03ae2ac0469351fbfefe5537282",
      "fen": "6rk/pp3p1p/8/3P2pq/6n1/1B4B1/PPP2PP1/3R1RK1 w - - 2 22",
      "badUci": "f2f3",
      "referenceGoodUci": "f1e1",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f1e1": {
              "winProbability": 0.5469468832015991,
              "drawProbability": 0.02373630926012993,
              "lossProbability": 0.42931684851646423
            },
            "f2f3": {
              "winProbability": 0.4385649561882019,
              "drawProbability": 0.028483735397458076,
              "lossProbability": 0.5329512357711792
            }
          },
          "goodMinusBadWinPercentagePoints": 10.838192701339722,
          "mistakeMinusGoodWinPercentagePoints": -10.838192701339722
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f1e1": {
              "winProbability": 0.6785651445388794,
              "drawProbability": 0.052497729659080505,
              "lossProbability": 0.2689371705055237
            },
            "f2f3": {
              "winProbability": 0.6288001537322998,
              "drawProbability": 0.05746090039610863,
              "lossProbability": 0.3137389123439789
            }
          },
          "goodMinusBadWinPercentagePoints": 4.976499080657959,
          "mistakeMinusGoodWinPercentagePoints": -4.976499080657959
        }
      }
    },
    "g03989_p023": {
      "caseId": "g03989_p023",
      "publicCaseSha256": "c7000bb402567d24ef01f6e9a72382f4e8dd8d9747d0739c6b878feacb3cc69e",
      "positionOptionsSha256": "fa722bd69ad08248469ca6b96c0e144331bc20e2f0da925ae704b3552202fc55",
      "fen": "r3k2r/1pp2p2/p1npbq2/2b1p1pp/4P3/3P1NBP/PPP1BPP1/R2QK2R w KQkq - 0 12",
      "badUci": "e1g1",
      "referenceGoodUci": "c2c3",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "c2c3": {
              "winProbability": 0.33923375606536865,
              "drawProbability": 0.02634814940392971,
              "lossProbability": 0.6344181299209595
            },
            "e1g1": {
              "winProbability": 0.21562425792217255,
              "drawProbability": 0.018512118607759476,
              "lossProbability": 0.7658635973930359
            }
          },
          "goodMinusBadWinPercentagePoints": 12.36094981431961,
          "mistakeMinusGoodWinPercentagePoints": -12.36094981431961
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "c2c3": {
              "winProbability": 0.3382267653942108,
              "drawProbability": 0.07669109106063843,
              "lossProbability": 0.5850821137428284
            },
            "e1g1": {
              "winProbability": 0.16509264707565308,
              "drawProbability": 0.037025611847639084,
              "lossProbability": 0.7978817820549011
            }
          },
          "goodMinusBadWinPercentagePoints": 17.313411831855774,
          "mistakeMinusGoodWinPercentagePoints": -17.313411831855774
        }
      }
    },
    "g04232_p022": {
      "caseId": "g04232_p022",
      "publicCaseSha256": "a524bec8e0ff908d0091ca4d9c5d773a1e29b2d32a5ae1a4dbf81680e1be35ed",
      "positionOptionsSha256": "55c5de3ff31ba743fdfd6ce8a804b75d966893563a241a8c5e4c15822eb09c77",
      "fen": "r2qkb1r/3nn1pp/pp1p1p2/2pPp3/P3P2B/2N2N2/1PP2PPP/R2Q1RK1 b kq - 1 11",
      "badUci": "a6a5",
      "referenceGoodUci": "g7g5",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "g7g5": {
              "winProbability": 0.4027631878852844,
              "drawProbability": 0.029455946758389473,
              "lossProbability": 0.5677808523178101
            },
            "a6a5": {
              "winProbability": 0.31359416246414185,
              "drawProbability": 0.02757929265499115,
              "lossProbability": 0.6588265895843506
            }
          },
          "goodMinusBadWinPercentagePoints": 8.916902542114258,
          "mistakeMinusGoodWinPercentagePoints": -8.916902542114258
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "g7g5": {
              "winProbability": 0.38890111446380615,
              "drawProbability": 0.057695500552654266,
              "lossProbability": 0.5534033179283142
            },
            "a6a5": {
              "winProbability": 0.2226783037185669,
              "drawProbability": 0.04718011990189552,
              "lossProbability": 0.7301415801048279
            }
          },
          "goodMinusBadWinPercentagePoints": 16.622281074523926,
          "mistakeMinusGoodWinPercentagePoints": -16.622281074523926
        }
      }
    },
    "g01832_p023": {
      "caseId": "g01832_p023",
      "publicCaseSha256": "b5a7c6c3f3ea45a23562218d5725a1292f674c2f6e0bc75cb75533cc205d767f",
      "positionOptionsSha256": "69b94116babe4b9d09be4f60e70f456e7872e56cecdf3000f7225fa6d73bfec2",
      "fen": "rnb1k2r/1p3pbp/p3p1p1/2BqP3/8/2PP1N2/P1P3PP/R2QKB1R w KQkq - 1 12",
      "badUci": "c5d4",
      "referenceGoodUci": "d3d4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "d3d4": {
              "winProbability": 0.5916197299957275,
              "drawProbability": 0.02951391413807869,
              "lossProbability": 0.37886640429496765
            },
            "c5d4": {
              "winProbability": 0.4566195607185364,
              "drawProbability": 0.033045098185539246,
              "lossProbability": 0.5103353261947632
            }
          },
          "goodMinusBadWinPercentagePoints": 13.500016927719116,
          "mistakeMinusGoodWinPercentagePoints": -13.500016927719116
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "d3d4": {
              "winProbability": 0.7128392457962036,
              "drawProbability": 0.0537959448993206,
              "lossProbability": 0.23336480557918549
            },
            "c5d4": {
              "winProbability": 0.4878881275653839,
              "drawProbability": 0.08207898586988449,
              "lossProbability": 0.4300328493118286
            }
          },
          "goodMinusBadWinPercentagePoints": 22.49511182308197,
          "mistakeMinusGoodWinPercentagePoints": -22.49511182308197
        }
      }
    },
    "g02124_p028": {
      "caseId": "g02124_p028",
      "publicCaseSha256": "01e984d1bc8b613ea46c49c5f52b63fca42bfa1bfd583dfeab1d455aa382a2ae",
      "positionOptionsSha256": "69870d09e414c40deb026f2d6edb98fa08e050240e8d07e54884bf97a4bf8722",
      "fen": "2kr3r/pb1q3p/1pnbpp2/5p2/2P4P/P1N1PN2/1PQ1BPP1/2KR3R b - - 4 14",
      "badUci": "f5f4",
      "referenceGoodUci": "d7e7",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "d7e7": {
              "winProbability": 0.418175607919693,
              "drawProbability": 0.03367280587553978,
              "lossProbability": 0.5481515526771545
            },
            "f5f4": {
              "winProbability": 0.2779553532600403,
              "drawProbability": 0.024320634081959724,
              "lossProbability": 0.6977239847183228
            }
          },
          "goodMinusBadWinPercentagePoints": 14.022025465965271,
          "mistakeMinusGoodWinPercentagePoints": -14.022025465965271
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "d7e7": {
              "winProbability": 0.35172903537750244,
              "drawProbability": 0.09538829326629639,
              "lossProbability": 0.5528826117515564
            },
            "f5f4": {
              "winProbability": 0.13131608068943024,
              "drawProbability": 0.034205175936222076,
              "lossProbability": 0.8344787955284119
            }
          },
          "goodMinusBadWinPercentagePoints": 22.04129546880722,
          "mistakeMinusGoodWinPercentagePoints": -22.04129546880722
        }
      }
    },
    "g04425_p030": {
      "caseId": "g04425_p030",
      "publicCaseSha256": "6cdf320849ce1744086037e958ab183fa1b18ba3d9d255b7ebfbd4dd4d9ead99",
      "positionOptionsSha256": "61fa9a9dd4f0b31f49632a351ca0f6aa5f68548a81638a3c1c647d0f0bfcfd1a",
      "fen": "r3kb1r/5pp1/2p1p1np/q2pPb2/3P4/P4NB1/3N1PPP/R2QK2R b KQkq - 3 15",
      "badUci": "f8b4",
      "referenceGoodUci": "f5d3",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f5d3": {
              "winProbability": 0.5914815068244934,
              "drawProbability": 0.02440601959824562,
              "lossProbability": 0.38411256670951843
            },
            "f8b4": {
              "winProbability": 0.5081053972244263,
              "drawProbability": 0.03749125450849533,
              "lossProbability": 0.4544033706188202
            }
          },
          "goodMinusBadWinPercentagePoints": 8.337610960006714,
          "mistakeMinusGoodWinPercentagePoints": -8.337610960006714
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f5d3": {
              "winProbability": 0.7334611415863037,
              "drawProbability": 0.05062438175082207,
              "lossProbability": 0.21591448783874512
            },
            "f8b4": {
              "winProbability": 0.607881486415863,
              "drawProbability": 0.08193910866975784,
              "lossProbability": 0.31017938256263733
            }
          },
          "goodMinusBadWinPercentagePoints": 12.557965517044067,
          "mistakeMinusGoodWinPercentagePoints": -12.557965517044067
        }
      }
    },
    "g04599_p026": {
      "caseId": "g04599_p026",
      "publicCaseSha256": "17a47b401af8fc8c72580a339ecddf9372b3f29fa9a1a90fc73857037d957113",
      "positionOptionsSha256": "eec6918301d38770821488fcba63f619d8be8cb3fe47488185bca54671d9d09a",
      "fen": "rn2k2r/p5pp/2pbPnb1/1p6/8/2N1PN2/PP3PPP/R1B2RK1 b kq - 0 13",
      "badUci": "g6f5",
      "referenceGoodUci": "b8a6",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "b8a6": {
              "winProbability": 0.6587657928466797,
              "drawProbability": 0.03697158023715019,
              "lossProbability": 0.30426251888275146
            },
            "g6f5": {
              "winProbability": 0.6157244443893433,
              "drawProbability": 0.034538596868515015,
              "lossProbability": 0.34973689913749695
            }
          },
          "goodMinusBadWinPercentagePoints": 4.304134845733643,
          "mistakeMinusGoodWinPercentagePoints": -4.304134845733643
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "b8a6": {
              "winProbability": 0.7743628621101379,
              "drawProbability": 0.057397570461034775,
              "lossProbability": 0.1682395339012146
            },
            "g6f5": {
              "winProbability": 0.6953535676002502,
              "drawProbability": 0.06154157966375351,
              "lossProbability": 0.24310486018657684
            }
          },
          "goodMinusBadWinPercentagePoints": 7.9009294509887695,
          "mistakeMinusGoodWinPercentagePoints": -7.9009294509887695
        }
      }
    },
    "g02539_p033": {
      "caseId": "g02539_p033",
      "publicCaseSha256": "122f363d6612a02eced55ff354c67c289911b20e9485009ea7ee729585e60c58",
      "positionOptionsSha256": "326e914e336c4c25523775798450a24f90ad0c34caa6697a41a4d15c61302679",
      "fen": "r3k1nr/1pqb4/p2p1ppp/4p3/Q3P3/2P1B3/PP2BPPP/R4RK1 w kq - 2 17",
      "badUci": "a4c2",
      "referenceGoodUci": "a4b4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "a4b4": {
              "winProbability": 0.5821317434310913,
              "drawProbability": 0.03409533202648163,
              "lossProbability": 0.38377296924591064
            },
            "a4c2": {
              "winProbability": 0.48448115587234497,
              "drawProbability": 0.03559483587741852,
              "lossProbability": 0.4799239933490753
            }
          },
          "goodMinusBadWinPercentagePoints": 9.765058755874634,
          "mistakeMinusGoodWinPercentagePoints": -9.765058755874634
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "a4b4": {
              "winProbability": 0.7403598427772522,
              "drawProbability": 0.062514528632164,
              "lossProbability": 0.19712556898593903
            },
            "a4c2": {
              "winProbability": 0.6344704627990723,
              "drawProbability": 0.08372271060943604,
              "lossProbability": 0.2818067967891693
            }
          },
          "goodMinusBadWinPercentagePoints": 10.588937997817993,
          "mistakeMinusGoodWinPercentagePoints": -10.588937997817993
        }
      }
    },
    "g02343_p033": {
      "caseId": "g02343_p033",
      "publicCaseSha256": "5c81f60cda427af73891fc6b7ff654b657fa9e5d40b2be2abaad7bc677d75f73",
      "positionOptionsSha256": "fe0cd05f3dc1da111e099979953e751e22b222a69c8d37a47965860c2f8b230b",
      "fen": "r2r2k1/pp1b1npp/1q1p1p2/8/3N2P1/P1NQP2P/1PP2P2/2KR3R w - - 3 17",
      "badUci": "d1g1",
      "referenceGoodUci": "f2f4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f2f4": {
              "winProbability": 0.6296854019165039,
              "drawProbability": 0.02473948523402214,
              "lossProbability": 0.34557509422302246
            },
            "d1g1": {
              "winProbability": 0.552925705909729,
              "drawProbability": 0.02219904400408268,
              "lossProbability": 0.4248752295970917
            }
          },
          "goodMinusBadWinPercentagePoints": 7.67596960067749,
          "mistakeMinusGoodWinPercentagePoints": -7.67596960067749
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f2f4": {
              "winProbability": 0.7856379151344299,
              "drawProbability": 0.04387253150343895,
              "lossProbability": 0.17048953473567963
            },
            "d1g1": {
              "winProbability": 0.730274498462677,
              "drawProbability": 0.04590102657675743,
              "lossProbability": 0.2238244265317917
            }
          },
          "goodMinusBadWinPercentagePoints": 5.536341667175293,
          "mistakeMinusGoodWinPercentagePoints": -5.536341667175293
        }
      }
    },
    "g00214_p020": {
      "caseId": "g00214_p020",
      "publicCaseSha256": "8f1c5a676f9e7d970299412cbe7eb02468c0813a955909f122fa9f7d4924cb86",
      "positionOptionsSha256": "8447741deb5bd071b7410482ff41a43b129ac9a9c4bc6710d6b86f39c76e5ebf",
      "fen": "rnbq1r2/pp3pbk/3p1npp/2pPp3/2P1P1P1/2N1BP2/PP1Q3P/R3KBNR b KQ - 0 10",
      "badUci": "g6g5",
      "referenceGoodUci": "a7a6",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "a7a6": {
              "winProbability": 0.32548195123672485,
              "drawProbability": 0.016700731590390205,
              "lossProbability": 0.6578173637390137
            },
            "g6g5": {
              "winProbability": 0.2197348177433014,
              "drawProbability": 0.014630718156695366,
              "lossProbability": 0.7656344771385193
            }
          },
          "goodMinusBadWinPercentagePoints": 10.574713349342346,
          "mistakeMinusGoodWinPercentagePoints": -10.574713349342346
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "a7a6": {
              "winProbability": 0.38207224011421204,
              "drawProbability": 0.053340911865234375,
              "lossProbability": 0.5645868182182312
            },
            "g6g5": {
              "winProbability": 0.16935746371746063,
              "drawProbability": 0.030573690310120583,
              "lossProbability": 0.8000687956809998
            }
          },
          "goodMinusBadWinPercentagePoints": 21.27147763967514,
          "mistakeMinusGoodWinPercentagePoints": -21.27147763967514
        }
      }
    },
    "g00965_p044": {
      "caseId": "g00965_p044",
      "publicCaseSha256": "11382a9deeb7cc3e1b72524a9875c317ca3b72aaa9b88a5415c8d0d1e3be606a",
      "positionOptionsSha256": "3973be7d168278ec940ac1845379bdd4e0992b1b51905f655fe7a1eddc496062",
      "fen": "r1b1r1kb/1p2np2/p2qp1pB/3p4/8/1N1B2P1/PP1Q1P2/4RRK1 b - - 0 22",
      "badUci": "h8g7",
      "referenceGoodUci": "e6e5",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "e6e5": {
              "winProbability": 0.6259029507637024,
              "drawProbability": 0.01852758415043354,
              "lossProbability": 0.3555695116519928
            },
            "h8g7": {
              "winProbability": 0.48689016699790955,
              "drawProbability": 0.023389751091599464,
              "lossProbability": 0.48972001671791077
            }
          },
          "goodMinusBadWinPercentagePoints": 13.901278376579285,
          "mistakeMinusGoodWinPercentagePoints": -13.901278376579285
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "e6e5": {
              "winProbability": 0.7498328685760498,
              "drawProbability": 0.040482401847839355,
              "lossProbability": 0.20968477427959442
            },
            "h8g7": {
              "winProbability": 0.5958765149116516,
              "drawProbability": 0.05837893486022949,
              "lossProbability": 0.3457445800304413
            }
          },
          "goodMinusBadWinPercentagePoints": 15.39563536643982,
          "mistakeMinusGoodWinPercentagePoints": -15.39563536643982
        }
      }
    },
    "g01536_p031": {
      "caseId": "g01536_p031",
      "publicCaseSha256": "a5f3b0d8a7f2d3c5fb3907a35d41085ae9d3da8e8c751ddd2b78488b7cd92ef8",
      "positionOptionsSha256": "e8236d7446b9ead7c10d6ba28e937253bb932f0abb68de81311ac0369505fa5d",
      "fen": "2r4r/ppp1bk2/2n2n1p/5N2/3Pp3/P1N1P3/1P3PPP/R1B1K2R w KQ - 3 16",
      "badUci": "d4d5",
      "referenceGoodUci": "e1g1",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "e1g1": {
              "winProbability": 0.7358071804046631,
              "drawProbability": 0.03892688825726509,
              "lossProbability": 0.22526593506336212
            },
            "d4d5": {
              "winProbability": 0.638800323009491,
              "drawProbability": 0.05143081769347191,
              "lossProbability": 0.30976882576942444
            }
          },
          "goodMinusBadWinPercentagePoints": 9.700685739517212,
          "mistakeMinusGoodWinPercentagePoints": -9.700685739517212
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "e1g1": {
              "winProbability": 0.880883514881134,
              "drawProbability": 0.033071648329496384,
              "lossProbability": 0.08604475110769272
            },
            "d4d5": {
              "winProbability": 0.675148606300354,
              "drawProbability": 0.07357306778430939,
              "lossProbability": 0.2512783408164978
            }
          },
          "goodMinusBadWinPercentagePoints": 20.573490858078003,
          "mistakeMinusGoodWinPercentagePoints": -20.573490858078003
        }
      }
    },
    "g02263_p045": {
      "caseId": "g02263_p045",
      "publicCaseSha256": "86be506df02642d2b8e182e619d274781649d36370c605c082c5d993152f887a",
      "positionOptionsSha256": "9ce3b983d8dd74d2094f1d3a75440a1d7a9470bf638018b71f4212e952a0a295",
      "fen": "2r2rk1/p5pp/1n6/1nNpp3/1P6/1PP1PP2/4N1PP/2R2K1R w - - 0 23",
      "badUci": "c5e6",
      "referenceGoodUci": "f1f2",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f1f2": {
              "winProbability": 0.6592241525650024,
              "drawProbability": 0.05578343942761421,
              "lossProbability": 0.28499242663383484
            },
            "c5e6": {
              "winProbability": 0.5304164886474609,
              "drawProbability": 0.06454187631607056,
              "lossProbability": 0.4050416052341461
            }
          },
          "goodMinusBadWinPercentagePoints": 12.88076639175415,
          "mistakeMinusGoodWinPercentagePoints": -12.88076639175415
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f1f2": {
              "winProbability": 0.8596318960189819,
              "drawProbability": 0.04458186775445938,
              "lossProbability": 0.09578630328178406
            },
            "c5e6": {
              "winProbability": 0.6678279638290405,
              "drawProbability": 0.0876689925789833,
              "lossProbability": 0.24450300633907318
            }
          },
          "goodMinusBadWinPercentagePoints": 19.18039321899414,
          "mistakeMinusGoodWinPercentagePoints": -19.18039321899414
        }
      }
    },
    "g00865_p032": {
      "caseId": "g00865_p032",
      "publicCaseSha256": "cab98694af55a160beff29ee2cc96ecb96eebfcc3f777bb97726b545c44df019",
      "positionOptionsSha256": "934f9aa8acacf0179897baaad72b2f92484aa897191191960ac725136201aba6",
      "fen": "r4rk1/2p1q1pp/p2p1n2/1p6/2b1P3/2N1QP2/PPP1B1PP/2KR3R b - - 0 16",
      "badUci": "f8d8",
      "referenceGoodUci": "c4f7",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "c4f7": {
              "winProbability": 0.4677034914493561,
              "drawProbability": 0.034192658960819244,
              "lossProbability": 0.49810391664505005
            },
            "f8d8": {
              "winProbability": 0.3201500475406647,
              "drawProbability": 0.038718994706869125,
              "lossProbability": 0.6411309242248535
            }
          },
          "goodMinusBadWinPercentagePoints": 14.75534439086914,
          "mistakeMinusGoodWinPercentagePoints": -14.75534439086914
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "c4f7": {
              "winProbability": 0.39974719285964966,
              "drawProbability": 0.08014583587646484,
              "lossProbability": 0.5201069712638855
            },
            "f8d8": {
              "winProbability": 0.22796718776226044,
              "drawProbability": 0.07129649072885513,
              "lossProbability": 0.7007362842559814
            }
          },
          "goodMinusBadWinPercentagePoints": 17.178000509738922,
          "mistakeMinusGoodWinPercentagePoints": -17.178000509738922
        }
      }
    },
    "g03956_p041": {
      "caseId": "g03956_p041",
      "publicCaseSha256": "2bfb822933d14471028e672874f73ad0156cc2e728f775b3922b1f556cf9f543",
      "positionOptionsSha256": "9b526fb97296c92e9333dadec7f7be88a458260a9c510015bb68d7b4cb0d0a2a",
      "fen": "r4rk1/p5pp/1q3bp1/3p3n/P2N1B2/2P5/1P1Q2PP/R4RK1 w - - 2 21",
      "badUci": "a1e1",
      "referenceGoodUci": "f4e3",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f4e3": {
              "winProbability": 0.5106853246688843,
              "drawProbability": 0.03308112919330597,
              "lossProbability": 0.45623356103897095
            },
            "a1e1": {
              "winProbability": 0.44680580496788025,
              "drawProbability": 0.03745736554265022,
              "lossProbability": 0.5157368183135986
            }
          },
          "goodMinusBadWinPercentagePoints": 6.387951970100403,
          "mistakeMinusGoodWinPercentagePoints": -6.387951970100403
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f4e3": {
              "winProbability": 0.572165310382843,
              "drawProbability": 0.09840426594018936,
              "lossProbability": 0.329430490732193
            },
            "a1e1": {
              "winProbability": 0.36193034052848816,
              "drawProbability": 0.15475119650363922,
              "lossProbability": 0.4833184778690338
            }
          },
          "goodMinusBadWinPercentagePoints": 21.023496985435486,
          "mistakeMinusGoodWinPercentagePoints": -21.023496985435486
        }
      }
    },
    "g02617_p045": {
      "caseId": "g02617_p045",
      "publicCaseSha256": "315579281962ed34a355e9d9a018db9d397f4f3342ffb0cd462d3d3bb3e8fb96",
      "positionOptionsSha256": "d2145a7079bec83f500dc660d782c6a910a0a99336233cb1ae01ccf549ccc007",
      "fen": "r4rk1/p7/1p3p1p/2p3p1/5P2/2b3B1/P1P3PP/1R3RK1 w - - 0 23",
      "badUci": "f4f5",
      "referenceGoodUci": "b1b3",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "b1b3": {
              "winProbability": 0.30756959319114685,
              "drawProbability": 0.09443196654319763,
              "lossProbability": 0.5979984998703003
            },
            "f4f5": {
              "winProbability": 0.2852218747138977,
              "drawProbability": 0.08188671618700027,
              "lossProbability": 0.6328914761543274
            }
          },
          "goodMinusBadWinPercentagePoints": 2.2347718477249146,
          "mistakeMinusGoodWinPercentagePoints": -2.2347718477249146
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "b1b3": {
              "winProbability": 0.18518435955047607,
              "drawProbability": 0.12560944259166718,
              "lossProbability": 0.6892061829566956
            },
            "f4f5": {
              "winProbability": 0.15759871900081635,
              "drawProbability": 0.10295255482196808,
              "lossProbability": 0.7394487261772156
            }
          },
          "goodMinusBadWinPercentagePoints": 2.758564054965973,
          "mistakeMinusGoodWinPercentagePoints": -2.758564054965973
        }
      }
    },
    "g00818_p027": {
      "caseId": "g00818_p027",
      "publicCaseSha256": "00690a61bcdea04381682223c4f6fbca9ab3160743b89796bbee789b8b139cc1",
      "positionOptionsSha256": "5e273e8a8f93188bf124aa2ca9c4f8e84e1e236f69b3610639a2d75cebdd41eb",
      "fen": "2kr1b1r/pp2q1pp/2p2n2/4p1B1/4P3/1Q6/PPP3PP/RN3RK1 w - - 2 14",
      "badUci": "b3a4",
      "referenceGoodUci": "b1d2",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "b1d2": {
              "winProbability": 0.5002840757369995,
              "drawProbability": 0.03215867280960083,
              "lossProbability": 0.46755728125572205
            },
            "b3a4": {
              "winProbability": 0.4225553572177887,
              "drawProbability": 0.03103039041161537,
              "lossProbability": 0.5464142560958862
            }
          },
          "goodMinusBadWinPercentagePoints": 7.7728718519210815,
          "mistakeMinusGoodWinPercentagePoints": -7.7728718519210815
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "b1d2": {
              "winProbability": 0.47714436054229736,
              "drawProbability": 0.10660982877016068,
              "lossProbability": 0.4162459075450897
            },
            "b3a4": {
              "winProbability": 0.32625526189804077,
              "drawProbability": 0.08126074820756912,
              "lossProbability": 0.5924839377403259
            }
          },
          "goodMinusBadWinPercentagePoints": 15.08890986442566,
          "mistakeMinusGoodWinPercentagePoints": -15.08890986442566
        }
      }
    },
    "g04229_p042": {
      "caseId": "g04229_p042",
      "publicCaseSha256": "d75aab6f396cc64be3fb939e2e4e5603bc439cf4b0b48c49e4d576a145067c24",
      "positionOptionsSha256": "57a98059a1218982814d36df0af4af912786707285f17689162867de6e15eacb",
      "fen": "r3q1k1/pp3p1p/6pP/3p1p2/3P1Q2/2P5/PP1K1P1P/4R3 b - - 1 21",
      "badUci": "e8b8",
      "referenceGoodUci": "e8d8",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "e8d8": {
              "winProbability": 0.1727030873298645,
              "drawProbability": 0.04517630860209465,
              "lossProbability": 0.7821205854415894
            },
            "e8b8": {
              "winProbability": 0.20734263956546783,
              "drawProbability": 0.056611500680446625,
              "lossProbability": 0.736045777797699
            }
          },
          "goodMinusBadWinPercentagePoints": -3.4639552235603333,
          "mistakeMinusGoodWinPercentagePoints": 3.4639552235603333
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "e8d8": {
              "winProbability": 0.1968114972114563,
              "drawProbability": 0.12827080488204956,
              "lossProbability": 0.6749177575111389
            },
            "e8b8": {
              "winProbability": 0.13775447010993958,
              "drawProbability": 0.09750926494598389,
              "lossProbability": 0.7647362947463989
            }
          },
          "goodMinusBadWinPercentagePoints": 5.905702710151672,
          "mistakeMinusGoodWinPercentagePoints": -5.905702710151672
        }
      }
    },
    "g01400_p064": {
      "caseId": "g01400_p064",
      "publicCaseSha256": "579b559c44f8959cb8d68b9c4dc57f6e1abe82cfe78936b1e99c44377a72ecf4",
      "positionOptionsSha256": "926dc1cb23fbd845590b0d9b85735ae28d0d84f9794990745faf492f6f4b54de",
      "fen": "1r3rk1/1b3pp1/5n1p/1p3q2/p3pP2/P3R2P/3BQ1PK/1BR5 b - - 3 32",
      "badUci": "f6h5",
      "referenceGoodUci": "b8c8",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "b8c8": {
              "winProbability": 0.5542298555374146,
              "drawProbability": 0.030354000627994537,
              "lossProbability": 0.4154161512851715
            },
            "f6h5": {
              "winProbability": 0.48129963874816895,
              "drawProbability": 0.025738833472132683,
              "lossProbability": 0.4929615259170532
            }
          },
          "goodMinusBadWinPercentagePoints": 7.2930216789245605,
          "mistakeMinusGoodWinPercentagePoints": -7.2930216789245605
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "b8c8": {
              "winProbability": 0.628007709980011,
              "drawProbability": 0.06716189533472061,
              "lossProbability": 0.3048304319381714
            },
            "f6h5": {
              "winProbability": 0.5446835160255432,
              "drawProbability": 0.07513294368982315,
              "lossProbability": 0.38018354773521423
            }
          },
          "goodMinusBadWinPercentagePoints": 8.332419395446777,
          "mistakeMinusGoodWinPercentagePoints": -8.332419395446777
        }
      }
    },
    "g00844_p021": {
      "caseId": "g00844_p021",
      "publicCaseSha256": "a2d97b98f42ee4e6da677eea7d74feddb43c1a34775772197af2f60c3b769e8d",
      "positionOptionsSha256": "813fddbe7eab90312002d91dce15a1ca52aa1791c6067a0fefadef31014a9308",
      "fen": "r1b1k2r/pp1nbppp/1q2pn2/1N1p4/2PP4/P2B1N2/1PQ2PPP/R1B1K2R w KQkq - 3 11",
      "badUci": "g2g4",
      "referenceGoodUci": "c1f4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "c1f4": {
              "winProbability": 0.7660863995552063,
              "drawProbability": 0.014030291698873043,
              "lossProbability": 0.21988330781459808
            },
            "g2g4": {
              "winProbability": 0.5483658313751221,
              "drawProbability": 0.018219707533717155,
              "lossProbability": 0.433414489030838
            }
          },
          "goodMinusBadWinPercentagePoints": 21.772056818008423,
          "mistakeMinusGoodWinPercentagePoints": -21.772056818008423
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "c1f4": {
              "winProbability": 0.8013896346092224,
              "drawProbability": 0.037744998931884766,
              "lossProbability": 0.16086532175540924
            },
            "g2g4": {
              "winProbability": 0.5178545117378235,
              "drawProbability": 0.06555517017841339,
              "lossProbability": 0.4165903627872467
            }
          },
          "goodMinusBadWinPercentagePoints": 28.353512287139893,
          "mistakeMinusGoodWinPercentagePoints": -28.353512287139893
        }
      }
    },
    "src02_g06493_p036": {
      "caseId": "src02_g06493_p036",
      "publicCaseSha256": "060447d10b47bb5d58e2d7167a2f11cc73f756ff34fc41b498c8f7803e4068c3",
      "positionOptionsSha256": "a24c64a0dd3f6321c20f83b1c9a78d34ffc149da6d3cecf21db11febfbfcd68d",
      "fen": "r1b2rk1/pp3pqp/2n1p1p1/3p4/7Q/2N5/PP3PPP/1BR1R1K1 b - - 3 18",
      "badUci": "d5d4",
      "referenceGoodUci": "c8d7",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "c8d7": {
              "winProbability": 0.5909414887428284,
              "drawProbability": 0.02472587488591671,
              "lossProbability": 0.3843325972557068
            },
            "d5d4": {
              "winProbability": 0.4698091447353363,
              "drawProbability": 0.024686189368367195,
              "lossProbability": 0.5055046677589417
            }
          },
          "goodMinusBadWinPercentagePoints": 12.113234400749207,
          "mistakeMinusGoodWinPercentagePoints": -12.113234400749207
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "c8d7": {
              "winProbability": 0.7479999661445618,
              "drawProbability": 0.04485763609409332,
              "lossProbability": 0.20714236795902252
            },
            "d5d4": {
              "winProbability": 0.5232923626899719,
              "drawProbability": 0.06263839453458786,
              "lossProbability": 0.41406920552253723
            }
          },
          "goodMinusBadWinPercentagePoints": 22.470760345458984,
          "mistakeMinusGoodWinPercentagePoints": -22.470760345458984
        }
      }
    },
    "g02062_p022": {
      "caseId": "g02062_p022",
      "publicCaseSha256": "f0e0e7e1e431275fa61327f536aa8e6c2252df7fbaea7e987b04220bb4b452e4",
      "positionOptionsSha256": "2e766c9fef3a24167d85eb56001b07911a293613d65548e279f9003d97d7dcaf",
      "fen": "r1bq1rk1/1ppn1ppp/p7/3QP3/4P3/2P2N2/P1P2PPP/R3KB1R b KQ - 0 11",
      "badUci": "d7b6",
      "referenceGoodUci": "d8e7",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "d8e7": {
              "winProbability": 0.47179773449897766,
              "drawProbability": 0.029567789286375046,
              "lossProbability": 0.4986344277858734
            },
            "d7b6": {
              "winProbability": 0.4347878396511078,
              "drawProbability": 0.04718250408768654,
              "lossProbability": 0.5180296897888184
            }
          },
          "goodMinusBadWinPercentagePoints": 3.7009894847869873,
          "mistakeMinusGoodWinPercentagePoints": -3.7009894847869873
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "d8e7": {
              "winProbability": 0.4127407670021057,
              "drawProbability": 0.07589855790138245,
              "lossProbability": 0.511360764503479
            },
            "d7b6": {
              "winProbability": 0.30904385447502136,
              "drawProbability": 0.08590017259120941,
              "lossProbability": 0.6050559282302856
            }
          },
          "goodMinusBadWinPercentagePoints": 10.369691252708435,
          "mistakeMinusGoodWinPercentagePoints": -10.369691252708435
        }
      }
    },
    "g04885_p020": {
      "caseId": "g04885_p020",
      "publicCaseSha256": "3488a8e8af201eb14a5b0ac6b76610dfd90f4eeff0236bd440c80dc17dfe4004",
      "positionOptionsSha256": "0bc572896b21383075c96cb5e443ceb0a5b1ff305fc85da1ca8a024aaca3a083",
      "fen": "r1bqk2r/pp2bppp/2n2n2/3p4/3N4/P7/1PP1BPPP/RNBQR1K1 b kq - 0 10",
      "badUci": "e7c5",
      "referenceGoodUci": "e8g8",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "e8g8": {
              "winProbability": 0.5018656253814697,
              "drawProbability": 0.030994413420557976,
              "lossProbability": 0.46713992953300476
            },
            "e7c5": {
              "winProbability": 0.3176362216472626,
              "drawProbability": 0.025285035371780396,
              "lossProbability": 0.6570788025856018
            }
          },
          "goodMinusBadWinPercentagePoints": 18.422940373420715,
          "mistakeMinusGoodWinPercentagePoints": -18.422940373420715
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "e8g8": {
              "winProbability": 0.46244582533836365,
              "drawProbability": 0.11957444250583649,
              "lossProbability": 0.41797980666160583
            },
            "e7c5": {
              "winProbability": 0.31464922428131104,
              "drawProbability": 0.07262150943279266,
              "lossProbability": 0.6127292513847351
            }
          },
          "goodMinusBadWinPercentagePoints": 14.779660105705261,
          "mistakeMinusGoodWinPercentagePoints": -14.779660105705261
        }
      }
    },
    "g03091_p018": {
      "caseId": "g03091_p018",
      "publicCaseSha256": "c12be51a291164e713612cdb44e0501654cfa77341841c9e1f701468b9404107",
      "positionOptionsSha256": "a700da7cebb8554d1c8459db479998fb48ff1fdb00a9f594eaf8cc4120b807b7",
      "fen": "r1bk1b1r/p1p2ppp/2pp1n2/4p1N1/8/3P4/PPP2PPP/RNB1K2R b KQ - 2 9",
      "badUci": "c8e6",
      "referenceGoodUci": "d8e8",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "d8e8": {
              "winProbability": 0.5634070634841919,
              "drawProbability": 0.05836965888738632,
              "lossProbability": 0.3782232403755188
            },
            "c8e6": {
              "winProbability": 0.5209899544715881,
              "drawProbability": 0.05829640477895737,
              "lossProbability": 0.4207136929035187
            }
          },
          "goodMinusBadWinPercentagePoints": 4.241710901260376,
          "mistakeMinusGoodWinPercentagePoints": -4.241710901260376
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "d8e8": {
              "winProbability": 0.786507785320282,
              "drawProbability": 0.06197899952530861,
              "lossProbability": 0.15151317417621613
            },
            "c8e6": {
              "winProbability": 0.6853484511375427,
              "drawProbability": 0.09087551385164261,
              "lossProbability": 0.22377605736255646
            }
          },
          "goodMinusBadWinPercentagePoints": 10.115933418273926,
          "mistakeMinusGoodWinPercentagePoints": -10.115933418273926
        }
      }
    },
    "g04842_p047": {
      "caseId": "g04842_p047",
      "publicCaseSha256": "f8b34e47dd056d2c0a53d13a4815339ede64be795c978dc20dd9e30f5a53a7d0",
      "positionOptionsSha256": "bd04c453ac16c47260f1e7df4654465e0fe76113c5bc6b851b0f4a078b69b254",
      "fen": "r4rk1/5ppp/p7/1p6/4p3/1bB1P3/4BPPP/2R2RK1 w - - 2 24",
      "badUci": "e2d1",
      "referenceGoodUci": "c3b4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "c3b4": {
              "winProbability": 0.6462849378585815,
              "drawProbability": 0.05562550947070122,
              "lossProbability": 0.29808956384658813
            },
            "e2d1": {
              "winProbability": 0.5882521271705627,
              "drawProbability": 0.07128599286079407,
              "lossProbability": 0.34046196937561035
            }
          },
          "goodMinusBadWinPercentagePoints": 5.80328106880188,
          "mistakeMinusGoodWinPercentagePoints": -5.80328106880188
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "c3b4": {
              "winProbability": 0.7641758322715759,
              "drawProbability": 0.09002946317195892,
              "lossProbability": 0.14579471945762634
            },
            "e2d1": {
              "winProbability": 0.6824069619178772,
              "drawProbability": 0.12077538669109344,
              "lossProbability": 0.19681768119335175
            }
          },
          "goodMinusBadWinPercentagePoints": 8.176887035369873,
          "mistakeMinusGoodWinPercentagePoints": -8.176887035369873
        }
      }
    },
    "g00744_p027": {
      "caseId": "g00744_p027",
      "publicCaseSha256": "4ae96f46a0a3cb8cc0f37abcea3c0438c4c8c8fc87f920795761881548dcfd32",
      "positionOptionsSha256": "6c0660446a3d56201eaee4033704a2bf576528843a2ba973eaa38b4860131a2d",
      "fen": "r4rk1/p1qnbpp1/4pn1p/1p1pN3/2pP1P2/2P1P3/PP1N1QPP/R1B2RK1 w - - 0 14",
      "badUci": "d2f3",
      "referenceGoodUci": "f2e2",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "f2e2": {
              "winProbability": 0.4807884395122528,
              "drawProbability": 0.040857698768377304,
              "lossProbability": 0.4783538281917572
            },
            "d2f3": {
              "winProbability": 0.4421860873699188,
              "drawProbability": 0.03570648282766342,
              "lossProbability": 0.5221074223518372
            }
          },
          "goodMinusBadWinPercentagePoints": 3.8602352142333984,
          "mistakeMinusGoodWinPercentagePoints": -3.8602352142333984
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "f2e2": {
              "winProbability": 0.4237729012966156,
              "drawProbability": 0.09703695774078369,
              "lossProbability": 0.4791901707649231
            },
            "d2f3": {
              "winProbability": 0.3195785880088806,
              "drawProbability": 0.07412994652986526,
              "lossProbability": 0.6062914729118347
            }
          },
          "goodMinusBadWinPercentagePoints": 10.419431328773499,
          "mistakeMinusGoodWinPercentagePoints": -10.419431328773499
        }
      }
    },
    "src02_g06749_p035": {
      "caseId": "src02_g06749_p035",
      "publicCaseSha256": "0bfbf12acf0bde1e0fa58095b8d8f0bbdd31485116ad9f182ad1fdaed19686ca",
      "positionOptionsSha256": "89fa1ac609f63a1c0ea748dc7ef56e4a4c73ac503b1a80d3c71b72e6655e43d8",
      "fen": "2kr1b1r/pppb2pp/1n1p4/4q3/2PpP3/PP1P2PP/2QNN1B1/R3K2R w KQ - 4 18",
      "badUci": "e1c1",
      "referenceGoodUci": "d2f3",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "d2f3": {
              "winProbability": 0.5892775058746338,
              "drawProbability": 0.023827549070119858,
              "lossProbability": 0.38689491152763367
            },
            "e1c1": {
              "winProbability": 0.47891154885292053,
              "drawProbability": 0.024027539417147636,
              "lossProbability": 0.4970609247684479
            }
          },
          "goodMinusBadWinPercentagePoints": 11.036595702171326,
          "mistakeMinusGoodWinPercentagePoints": -11.036595702171326
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "d2f3": {
              "winProbability": 0.6120368838310242,
              "drawProbability": 0.058948978781700134,
              "lossProbability": 0.3290141224861145
            },
            "e1c1": {
              "winProbability": 0.44159990549087524,
              "drawProbability": 0.07582531869411469,
              "lossProbability": 0.48257482051849365
            }
          },
          "goodMinusBadWinPercentagePoints": 17.043697834014893,
          "mistakeMinusGoodWinPercentagePoints": -17.043697834014893
        }
      }
    },
    "src02_g06737_p053": {
      "caseId": "src02_g06737_p053",
      "publicCaseSha256": "5690542dd9bb5eb600285d71c2a137bd28b8a3b42224aedbd0034c88e02ae173",
      "positionOptionsSha256": "4c625454c80b5af4648e8101273fa813aa6d96c6e0342d1ad9ed02a59ad26316",
      "fen": "2r4k/pp3rp1/2p4q/3p2Rp/3PpP2/7P/PP1Q1PP1/5RK1 w - - 5 27",
      "badUci": "g5e5",
      "referenceGoodUci": "d2e2",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "d2e2": {
              "winProbability": 0.5314252972602844,
              "drawProbability": 0.04283461347222328,
              "lossProbability": 0.42574015259742737
            },
            "g5e5": {
              "winProbability": 0.3756016194820404,
              "drawProbability": 0.04667475074529648,
              "lossProbability": 0.5777236223220825
            }
          },
          "goodMinusBadWinPercentagePoints": 15.582367777824402,
          "mistakeMinusGoodWinPercentagePoints": -15.582367777824402
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "d2e2": {
              "winProbability": 0.4748350977897644,
              "drawProbability": 0.11898844689130783,
              "lossProbability": 0.4061764180660248
            },
            "g5e5": {
              "winProbability": 0.364345908164978,
              "drawProbability": 0.12901896238327026,
              "lossProbability": 0.5066351294517517
            }
          },
          "goodMinusBadWinPercentagePoints": 11.048918962478638,
          "mistakeMinusGoodWinPercentagePoints": -11.048918962478638
        }
      }
    },
    "src02_g06286_p027": {
      "caseId": "src02_g06286_p027",
      "publicCaseSha256": "fbb737f80edca0fa0025ba383ccaa1c76d3a41ea1c994b04d21ca075e17b4182",
      "positionOptionsSha256": "abfec00d9b16130506b76b848bd67aff8d10a7c0e317c71a2f551909b5aa16fe",
      "fen": "r1bq1rk1/p1p1np1p/1p1p2p1/1PnP4/2P5/2NB4/P3NPPP/R2Q1RK1 w - - 1 14",
      "badUci": "f2f4",
      "referenceGoodUci": "e2d4",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "e2d4": {
              "winProbability": 0.4952062666416168,
              "drawProbability": 0.04658692702651024,
              "lossProbability": 0.45820680260658264
            },
            "f2f4": {
              "winProbability": 0.42289260029792786,
              "drawProbability": 0.04843064397573471,
              "lossProbability": 0.5286767482757568
            }
          },
          "goodMinusBadWinPercentagePoints": 7.2313666343688965,
          "mistakeMinusGoodWinPercentagePoints": -7.2313666343688965
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "e2d4": {
              "winProbability": 0.47733309864997864,
              "drawProbability": 0.12414950877428055,
              "lossProbability": 0.3985174000263214
            },
            "f2f4": {
              "winProbability": 0.3853568732738495,
              "drawProbability": 0.12247713655233383,
              "lossProbability": 0.4921659231185913
            }
          },
          "goodMinusBadWinPercentagePoints": 9.197622537612915,
          "mistakeMinusGoodWinPercentagePoints": -9.197622537612915
        }
      }
    },
    "src02_g06339_p047": {
      "caseId": "src02_g06339_p047",
      "publicCaseSha256": "011d52c8f49ff343a96034d54ef9354e93f62bb1f94e28ebe4b6ff394995aa0a",
      "positionOptionsSha256": "80ec9a9881f3d4d49926bb4ba32ff203d9431c3477dd3b66c00c2e5d207f36ff",
      "fen": "3r3r/R1pk1p2/1p2p1np/1p4p1/1P1PPn2/1NP2PB1/6PP/4R1K1 w - - 2 24",
      "badUci": "e1e3",
      "referenceGoodUci": "e1a1",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "e1a1": {
              "winProbability": 0.36405444145202637,
              "drawProbability": 0.05985676497220993,
              "lossProbability": 0.5760887265205383
            },
            "e1e3": {
              "winProbability": 0.3318948447704315,
              "drawProbability": 0.056539226323366165,
              "lossProbability": 0.611565887928009
            }
          },
          "goodMinusBadWinPercentagePoints": 3.215959668159485,
          "mistakeMinusGoodWinPercentagePoints": -3.215959668159485
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "e1a1": {
              "winProbability": 0.3801136612892151,
              "drawProbability": 0.1325339823961258,
              "lossProbability": 0.4873523712158203
            },
            "e1e3": {
              "winProbability": 0.2140580713748932,
              "drawProbability": 0.10091832280158997,
              "lossProbability": 0.6850235462188721
            }
          },
          "goodMinusBadWinPercentagePoints": 16.60555899143219,
          "mistakeMinusGoodWinPercentagePoints": -16.60555899143219
        }
      }
    },
    "src02_g06634_p024": {
      "caseId": "src02_g06634_p024",
      "publicCaseSha256": "906de11c576b28f5b6c0a2468c8cea0747b6e18168799ea6c930003a94c11bb1",
      "positionOptionsSha256": "da2b73ceebe6866fe0c94f892dde2329040f669ecb2b86db0cb7e1e85b9fb9fb",
      "fen": "2kr3r/pppnqpp1/3p1n1p/8/4P3/5N2/PPP1QPPP/R1B1R1K1 b - - 3 12",
      "badUci": "d7e5",
      "referenceGoodUci": "h8e8",
      "estimates": {
        "1500": {
          "selfRating": 1500,
          "opponentRating": 1500,
          "options": {
            "h8e8": {
              "winProbability": 0.5448976159095764,
              "drawProbability": 0.045098353177309036,
              "lossProbability": 0.41000404953956604
            },
            "d7e5": {
              "winProbability": 0.47709569334983826,
              "drawProbability": 0.04271719977259636,
              "lossProbability": 0.48018714785575867
            }
          },
          "goodMinusBadWinPercentagePoints": 6.780192255973816,
          "mistakeMinusGoodWinPercentagePoints": -6.780192255973816
        },
        "2600": {
          "selfRating": 2600,
          "opponentRating": 2600,
          "options": {
            "h8e8": {
              "winProbability": 0.5650102496147156,
              "drawProbability": 0.11577264219522476,
              "lossProbability": 0.31921708583831787
            },
            "d7e5": {
              "winProbability": 0.38606616854667664,
              "drawProbability": 0.11667736619710922,
              "lossProbability": 0.49725639820098877
            }
          },
          "goodMinusBadWinPercentagePoints": 17.894408106803894,
          "mistakeMinusGoodWinPercentagePoints": -17.894408106803894
        }
      }
    }
  },
  "independentReview": {
    "type": "Independent numeric validation",
    "receiptSha256": "170d81a1f5d7f0e6eebaed60540e8f38aa2cb1ad044ae8a67c97debd13f20005",
    "scope": "All300 child-position outputs and100 displayed comparisons; full-history/POV/binary-control checks, fresh model spot checks and binding-tamper tests."
  }
}
;
