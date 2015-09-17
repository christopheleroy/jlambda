{"payload": {"example": [0,1,2,3], 
             "diamonds" : [
                {"a": "white", "b": 100},
                {"a": "yellow", "b": 155},
                {"a": "blue", "b": 243 }
              ]},

 "lambda": [ {"f": "+", "with": "example"}, 
             {"pluck": "a", "with": "diamonds"},
             {"pluck": "b", "with": "diamonds"} ],

 "comments": "the with-string operator allows to apply a function to member of the input data only",

 "expect" : [ 6, 
              ["white","yellow","blue"],
              [100,155,243]
             ]

}